# WEBOS local HTTP service - Windows PowerShell 5.1+
# Binds ONLY to 127.0.0.1. Serves the package and persists login.json.
$ErrorActionPreference = 'Stop'
$port = 18767

$source = @'
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Diagnostics;

public sealed class WebosLocalServer
{
    private readonly string root;
    private readonly string rootPrefix;
    private readonly string contentRoot;
    private readonly string contentRootPrefix;
    private readonly int port;
    private readonly object loginLock = new object();
    private readonly object contentLock = new object();
    private TcpListener listener;

    public WebosLocalServer(string packageRoot, int portNumber)
    {
        root = Path.GetFullPath(packageRoot);
        rootPrefix = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        contentRoot = Path.GetFullPath(Path.Combine(@"C:\WebosContentFolder", "Content"));
        contentRootPrefix = contentRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        bool contentAlreadyExisted = Directory.Exists(contentRoot);
        Directory.CreateDirectory(contentRoot);
        if (!contentAlreadyExisted) CopySeedDirectory(Path.Combine(root, "Content"), contentRoot);
        port = portNumber;
    }

    public void Start()
    {
        listener = new TcpListener(IPAddress.Loopback, port);
        listener.Start(64);
        Thread acceptThread = new Thread(AcceptLoop);
        acceptThread.IsBackground = true;
        acceptThread.Name = "WEBOS local HTTP service";
        acceptThread.Start();
    }

    private void AcceptLoop()
    {
        while (true)
        {
            try
            {
                TcpClient client = listener.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(delegate(object state) { HandleClient((TcpClient)state); }, client);
            }
            catch (SocketException) { Thread.Sleep(300); }
            catch (ObjectDisposedException) { return; }
            catch { Thread.Sleep(300); }
        }
    }

    private static string ReadLine(Stream stream)
    {
        List<byte> data = new List<byte>();
        while (data.Count < 16384)
        {
            int value = stream.ReadByte();
            if (value < 0) break;
            if (value == 10) break;
            if (value != 13) data.Add((byte)value);
        }
        return Encoding.ASCII.GetString(data.ToArray());
    }

    private static byte[] ReadExact(Stream stream, int count)
    {
        byte[] buffer = new byte[count];
        int offset = 0;
        while (offset < count)
        {
            int read = stream.Read(buffer, offset, count - offset);
            if (read <= 0) throw new IOException("The HTTP request body ended unexpectedly.");
            offset += read;
        }
        return buffer;
    }

    private static void WriteHeaders(Stream stream, int status, string reason, string contentType, long contentLength, Dictionary<string, string> extra)
    {
        StringBuilder header = new StringBuilder();
        header.Append("HTTP/1.1 ").Append(status).Append(' ').Append(reason).Append("\r\n");
        header.Append("Server: WEBOS-Local\r\n");
        header.Append("Content-Type: ").Append(contentType).Append("\r\n");
        header.Append("Content-Length: ").Append(contentLength).Append("\r\n");
        header.Append("Connection: close\r\n");
        header.Append("X-Content-Type-Options: nosniff\r\n");
        if (extra != null)
        {
            foreach (KeyValuePair<string, string> pair in extra)
                header.Append(pair.Key).Append(": ").Append(pair.Value).Append("\r\n");
        }
        header.Append("\r\n");
        byte[] bytes = Encoding.ASCII.GetBytes(header.ToString());
        stream.Write(bytes, 0, bytes.Length);
    }

    private static void WriteText(Stream stream, int status, string reason, string body, string contentType, Dictionary<string, string> extra)
    {
        byte[] bytes = new UTF8Encoding(false).GetBytes(body ?? "");
        WriteHeaders(stream, status, reason, contentType, bytes.Length, extra);
        if (bytes.Length > 0) stream.Write(bytes, 0, bytes.Length);
    }

    private static string MimeType(string path)
    {
        string ext = Path.GetExtension(path).ToLowerInvariant();
        switch (ext)
        {
            case ".html": return "text/html; charset=utf-8";
            case ".htm": return "text/html; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".js": return "application/javascript; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".txt": return "text/plain; charset=utf-8";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".webp": return "image/webp";
            case ".gif": return "image/gif";
            case ".bmp": return "image/bmp";
            case ".svg": return "image/svg+xml";
            case ".mp4": case ".m4v": return "video/mp4";
            case ".webm": return "video/webm";
            case ".ogv": return "video/ogg";
            case ".mov": return "video/quicktime";
            case ".mkv": return "video/x-matroska";
            case ".avi": return "video/x-msvideo";
            case ".wmv": return "video/x-ms-wmv";
            case ".flv": return "video/x-flv";
            case ".3gp": return "video/3gpp";
            case ".mpeg": case ".mpg": return "video/mpeg";
            case ".mts": case ".m2ts": return "video/mp2t";
            case ".mp3": return "audio/mpeg";
            case ".wav": case ".wave": return "audio/wav";
            case ".pdf": return "application/pdf";
            case ".ico": return "image/x-icon";
            default: return "application/octet-stream";
        }
    }


    private static void CopySeedDirectory(string source, string destination)
    {
        if (!Directory.Exists(source)) return;
        foreach (string directory in Directory.GetDirectories(source))
        {
            string target = Path.Combine(destination, Path.GetFileName(directory));
            Directory.CreateDirectory(target);
            CopySeedDirectory(directory, target);
        }
        foreach (string file in Directory.GetFiles(source))
        {
            string target = Path.Combine(destination, Path.GetFileName(file));
            if (!File.Exists(target)) File.Copy(file, target, false);
        }
    }

    private static string JsonQuote(string value)
    {
        if (value == null) value = "";
        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n").Replace("\t", "\\t") + "\"";
    }

    private static string QueryValue(string target, string key)
    {
        int question = target.IndexOf('?');
        if (question < 0 || question + 1 >= target.Length) return "";
        string[] pairs = target.Substring(question + 1).Split('&');
        foreach (string pair in pairs)
        {
            string[] parts = pair.Split(new char[] { '=' }, 2);
            string currentKey = Uri.UnescapeDataString(parts[0].Replace("+", "%20"));
            if (String.Equals(currentKey, key, StringComparison.OrdinalIgnoreCase))
                return parts.Length > 1 ? Uri.UnescapeDataString(parts[1].Replace("+", "%20")) : "";
        }
        return "";
    }

    private string ResolveContentPath(string relative)
    {
        string normalized = (relative ?? "").Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
        if (Path.IsPathRooted(normalized)) throw new UnauthorizedAccessException("A Content mappán kívüli útvonal nem engedélyezett.");
        string full = Path.GetFullPath(Path.Combine(contentRoot, normalized));
        if (!String.Equals(full, contentRoot, StringComparison.OrdinalIgnoreCase) &&
            !full.StartsWith(contentRootPrefix, StringComparison.OrdinalIgnoreCase))
            throw new UnauthorizedAccessException("A Content mappán kívüli útvonal nem engedélyezett.");
        return full;
    }

    private static void WriteApiError(Stream stream, int status, string reason, string name, string message)
    {
        string json = "{\"ok\":false,\"name\":" + JsonQuote(name) + ",\"error\":" + JsonQuote(message) + "}";
        WriteText(stream, status, reason, json, "application/json; charset=utf-8", new Dictionary<string, string> { { "Cache-Control", "no-store" } });
    }

    private void HandleContentApi(string method, string target, Dictionary<string, string> headers, byte[] requestBody, Stream stream)
    {
        string origin = headers.ContainsKey("Origin") ? headers["Origin"] : "";
        string expectedOrigin = "http://127.0.0.1:" + port.ToString();
        if (!String.IsNullOrEmpty(origin) && !String.Equals(origin, expectedOrigin, StringComparison.OrdinalIgnoreCase))
        {
            WriteApiError(stream, 403, "Forbidden", "SecurityError", "A Content API csak a WEBOS helyi felületéről érhető el.");
            return;
        }

        string route = Uri.UnescapeDataString(target.Split('?')[0]).Substring("/api/content/".Length).ToLowerInvariant();
        if (route == "status")
        {
            if (method != "GET" && method != "HEAD") { WriteApiError(stream,405,"Method Not Allowed","NotSupportedError","A státusz csak GET kéréssel olvasható."); return; }
            string json = "{\"ok\":true,\"path\":" + JsonQuote(contentRoot) + "}";
            byte[] data = Encoding.UTF8.GetBytes(json);
            WriteHeaders(stream,200,"OK","application/json; charset=utf-8",data.Length,new Dictionary<string,string>{{"Cache-Control","no-store"}});
            if (method != "HEAD") stream.Write(data,0,data.Length);
            return;
        }

        string relative = QueryValue(target,"path");
        string fullPath;
        try { fullPath = ResolveContentPath(relative); }
        catch (Exception ex) { WriteApiError(stream,403,"Forbidden","SecurityError",ex.Message); return; }

        try
        {
            if (route == "list")
            {
                if (method != "GET" && method != "HEAD") { WriteApiError(stream,405,"Method Not Allowed","NotSupportedError","A mappalista csak GET kéréssel olvasható."); return; }
                if (File.Exists(fullPath)) { WriteApiError(stream,409,"Conflict","TypeMismatchError","A megadott útvonal fájl, nem mappa."); return; }
                if (!Directory.Exists(fullPath)) { WriteApiError(stream,404,"Not Found","NotFoundError","A mappa nem található."); return; }
                StringBuilder json = new StringBuilder(); json.Append("{\"ok\":true,\"entries\":["); bool first = true;
                foreach (string directory in Directory.GetDirectories(fullPath))
                {
                    if (!first) json.Append(','); first = false;
                    json.Append("{\"name\":").Append(JsonQuote(Path.GetFileName(directory))).Append(",\"kind\":\"directory\"}");
                }
                foreach (string file in Directory.GetFiles(fullPath))
                {
                    FileInfo info = new FileInfo(file);
                    if (!first) json.Append(','); first = false;
                    json.Append("{\"name\":").Append(JsonQuote(info.Name)).Append(",\"kind\":\"file\",\"size\":").Append(info.Length.ToString()).Append("}");
                }
                json.Append("]}"); byte[] data = Encoding.UTF8.GetBytes(json.ToString());
                WriteHeaders(stream,200,"OK","application/json; charset=utf-8",data.Length,new Dictionary<string,string>{{"Cache-Control","no-store"}});
                if (method != "HEAD") stream.Write(data,0,data.Length);
                return;
            }

            if (route == "directory")
            {
                if (method == "POST")
                {
                    if (File.Exists(fullPath)) { WriteApiError(stream,409,"Conflict","TypeMismatchError","Ezen a néven már fájl létezik."); return; }
                    Directory.CreateDirectory(fullPath);
                    WriteText(stream,200,"OK","{\"ok\":true}","application/json; charset=utf-8",null); return;
                }
                if (method == "GET" || method == "HEAD")
                {
                    if (File.Exists(fullPath)) { WriteApiError(stream,409,"Conflict","TypeMismatchError","A megadott útvonal fájl, nem mappa."); return; }
                    if (!Directory.Exists(fullPath)) { WriteApiError(stream,404,"Not Found","NotFoundError","A mappa nem található."); return; }
                    WriteText(stream,200,"OK","{\"ok\":true}","application/json; charset=utf-8",null); return;
                }
                WriteApiError(stream,405,"Method Not Allowed","NotSupportedError","Nem támogatott mappaművelet."); return;
            }

            if (route == "file")
            {
                if (method == "POST")
                {
                    if (Directory.Exists(fullPath)) { WriteApiError(stream,409,"Conflict","TypeMismatchError","Ezen a néven már mappa létezik."); return; }
                    if (!File.Exists(fullPath))
                    {
                        string parent = Path.GetDirectoryName(fullPath);
                        if (!Directory.Exists(parent)) { WriteApiError(stream,404,"Not Found","NotFoundError","A szülőmappa nem található."); return; }
                        using (FileStream created = new FileStream(fullPath,FileMode.CreateNew,FileAccess.Write,FileShare.Read)) { }
                    }
                    WriteText(stream,200,"OK","{\"ok\":true}","application/json; charset=utf-8",null); return;
                }
                if (method == "GET" || method == "HEAD")
                {
                    if (Directory.Exists(fullPath)) { WriteApiError(stream,409,"Conflict","TypeMismatchError","A megadott útvonal mappa, nem fájl."); return; }
                    if (!File.Exists(fullPath)) { WriteApiError(stream,404,"Not Found","NotFoundError","A fájl nem található."); return; }
                    WriteText(stream,200,"OK","{\"ok\":true}","application/json; charset=utf-8",null); return;
                }
                WriteApiError(stream,405,"Method Not Allowed","NotSupportedError","Nem támogatott fájlművelet."); return;
            }

            if (route == "read")
            {
                if (method != "GET" && method != "HEAD") { WriteApiError(stream,405,"Method Not Allowed","NotSupportedError","A fájl csak GET kéréssel olvasható."); return; }
                if (Directory.Exists(fullPath)) { WriteApiError(stream,409,"Conflict","TypeMismatchError","A megadott útvonal mappa, nem fájl."); return; }
                if (!File.Exists(fullPath)) { WriteApiError(stream,404,"Not Found","NotFoundError","A fájl nem található."); return; }
                FileInfo info = new FileInfo(fullPath);
                Dictionary<string,string> extra = new Dictionary<string,string> { { "Cache-Control", "no-store" }, { "Last-Modified", info.LastWriteTimeUtc.ToString("R") } };
                WriteHeaders(stream,200,"OK",MimeType(fullPath),info.Length,extra);
                if (method != "HEAD")
                {
                    using (FileStream file = new FileStream(fullPath,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))
                    {
                        byte[] buffer = new byte[64 * 1024]; int read;
                        while ((read = file.Read(buffer,0,buffer.Length)) > 0) stream.Write(buffer,0,read);
                    }
                }
                return;
            }

            if (route == "write")
            {
                if (method != "POST") { WriteApiError(stream,405,"Method Not Allowed","NotSupportedError","A fájl mentéséhez POST kérés szükséges."); return; }
                if (Directory.Exists(fullPath)) { WriteApiError(stream,409,"Conflict","TypeMismatchError","A megadott útvonal mappa, nem fájl."); return; }
                string parent = Path.GetDirectoryName(fullPath);
                if (!Directory.Exists(parent)) { WriteApiError(stream,404,"Not Found","NotFoundError","A szülőmappa nem található."); return; }
                lock (contentLock)
                {
                    string temp = fullPath + ".webos-tmp-" + Guid.NewGuid().ToString("N");
                    File.WriteAllBytes(temp,requestBody);
                    if (File.Exists(fullPath))
                    {
                        try { File.Replace(temp,fullPath,null); }
                        catch { File.Copy(temp,fullPath,true); File.Delete(temp); }
                    }
                    else File.Move(temp,fullPath);
                }
                WriteText(stream,200,"OK","{\"ok\":true}","application/json; charset=utf-8",new Dictionary<string,string>{{"Cache-Control","no-store"}}); return;
            }

            if (route == "remove")
            {
                if (method != "DELETE") { WriteApiError(stream,405,"Method Not Allowed","NotSupportedError","A törléshez DELETE kérés szükséges."); return; }
                bool recursive = String.Equals(QueryValue(target,"recursive"),"true",StringComparison.OrdinalIgnoreCase) || QueryValue(target,"recursive") == "1";
                if (File.Exists(fullPath)) File.Delete(fullPath);
                else if (Directory.Exists(fullPath)) Directory.Delete(fullPath,recursive);
                else { WriteApiError(stream,404,"Not Found","NotFoundError","A törlendő fájl vagy mappa nem található."); return; }
                WriteText(stream,200,"OK","{\"ok\":true}","application/json; charset=utf-8",null); return;
            }

            WriteApiError(stream,404,"Not Found","NotFoundError","Ismeretlen Content API végpont.");
        }
        catch (UnauthorizedAccessException ex) { WriteApiError(stream,403,"Forbidden","NotAllowedError",ex.Message); }
        catch (FileNotFoundException ex) { WriteApiError(stream,404,"Not Found","NotFoundError",ex.Message); }
        catch (DirectoryNotFoundException ex) { WriteApiError(stream,404,"Not Found","NotFoundError",ex.Message); }
        catch (Exception ex) { WriteApiError(stream,500,"Internal Server Error","UnknownError",ex.Message); }
    }

    private void HandleClient(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 120000;
                client.SendTimeout = 120000;
                using (NetworkStream stream = client.GetStream())
                {
                    string requestLine = ReadLine(stream);
                    if (String.IsNullOrWhiteSpace(requestLine)) return;
                    string[] requestParts = requestLine.Split(new char[] { ' ' }, 3);
                    if (requestParts.Length < 2) { WriteText(stream, 400, "Bad Request", "Bad request", "text/plain; charset=utf-8", null); return; }
                    string method = requestParts[0].ToUpperInvariant();
                    string target = requestParts[1];
                    Dictionary<string, string> headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    string line;
                    while (!String.IsNullOrEmpty(line = ReadLine(stream)))
                    {
                        int separator = line.IndexOf(':');
                        if (separator > 0) headers[line.Substring(0, separator).Trim()] = line.Substring(separator + 1).Trim();
                    }

                    int contentLength = 0;
                    if (headers.ContainsKey("Content-Length")) Int32.TryParse(headers["Content-Length"], out contentLength);
                    if (contentLength < 0 || contentLength > 256 * 1024 * 1024) { WriteText(stream, 413, "Payload Too Large", "Request too large", "text/plain; charset=utf-8", null); return; }
                    byte[] requestBody = contentLength > 0 ? ReadExact(stream, contentLength) : new byte[0];

                    string pathOnly = target.Split('?')[0];
                    string path = Uri.UnescapeDataString(pathOnly);
                    if (path == "/api/status" && (method == "GET" || method == "HEAD"))
                    {
                        string json = "{\"app\":\"WEBOS\",\"version\":34,\"status\":\"ready\",\"port\":" + port.ToString() + "}";
                        byte[] data = Encoding.UTF8.GetBytes(json);
                        WriteHeaders(stream, 200, "OK", "application/json; charset=utf-8", data.Length, new Dictionary<string, string> { { "Cache-Control", "no-store" } });
                        if (method != "HEAD") stream.Write(data, 0, data.Length);
                        return;
                    }

                    if (path.Equals("/api/launch-mti", StringComparison.OrdinalIgnoreCase))
                    {
                        if (method != "POST")
                        {
                            WriteText(stream, 405, "Method Not Allowed", "{\"ok\":false,\"error\":\"POST required\"}", "application/json; charset=utf-8", null);
                            return;
                        }
                        string origin = headers.ContainsKey("Origin") ? headers["Origin"] : "";
                        string expectedOrigin = "http://127.0.0.1:" + port.ToString();
                        if (!String.IsNullOrEmpty(origin) && !String.Equals(origin, expectedOrigin, StringComparison.OrdinalIgnoreCase))
                        {
                            WriteText(stream, 403, "Forbidden", "{\"ok\":false,\"error\":\"Origin is not allowed\"}", "application/json; charset=utf-8", null);
                            return;
                        }

                        // Only execute a shortcut located directly beside WEBOS.html.
                        // mti.ink is the requested file name; mti.lnk is accepted as the standard Windows shortcut extension.
                        string shortcutPath = Path.Combine(root, "mti.ink");
                        if (!File.Exists(shortcutPath)) shortcutPath = Path.Combine(root, "mti.lnk");
                        if (!File.Exists(shortcutPath))
                        {
                            WriteText(stream, 404, "Not Found", "{\"ok\":false,\"error\":\"Nem található mti.ink vagy mti.lnk parancsikon a WEBOS.html mellett.\"}", "application/json; charset=utf-8", null);
                            return;
                        }

                        try
                        {
                            ProcessStartInfo startInfo = new ProcessStartInfo();
                            startInfo.FileName = shortcutPath;
                            startInfo.WorkingDirectory = root;
                            startInfo.UseShellExecute = true;
                            startInfo.Verb = "open";
                            Process.Start(startInfo);
                            WriteText(stream, 200, "OK", "{\"ok\":true,\"shortcut\":\"" + Path.GetFileName(shortcutPath) + "\"}", "application/json; charset=utf-8", new Dictionary<string, string> { { "Cache-Control", "no-store" } });
                        }
                        catch (Exception ex)
                        {
                            string message = (ex.Message ?? "A Windows nem tudta megnyitni a parancsikont.").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
                            WriteText(stream, 500, "Internal Server Error", "{\"ok\":false,\"error\":\"" + message + "\"}", "application/json; charset=utf-8", null);
                        }
                        return;
                    }

                    if (path.StartsWith("/api/content/", StringComparison.OrdinalIgnoreCase))
                    {
                        HandleContentApi(method, target, headers, requestBody, stream);
                        return;
                    }

                    if (path.Equals("/api/login", StringComparison.OrdinalIgnoreCase))
                    {
                        string loginPath = Path.Combine(root, "login.json");
                        if (method == "GET" || method == "HEAD")
                        {
                            if (!File.Exists(loginPath)) { WriteText(stream, 404, "Not Found", "{\"ok\":false,\"error\":\"login.json missing\"}", "application/json; charset=utf-8", null); return; }
                            byte[] json = File.ReadAllBytes(loginPath);
                            WriteHeaders(stream, 200, "OK", "application/json; charset=utf-8", json.Length, new Dictionary<string, string> { { "Cache-Control", "no-store, no-cache, must-revalidate" } });
                            if (method != "HEAD") stream.Write(json, 0, json.Length);
                            return;
                        }
                        if (method == "POST")
                        {
                            string origin = headers.ContainsKey("Origin") ? headers["Origin"] : "";
                            string expectedOrigin = "http://127.0.0.1:" + port.ToString();
                            if (!String.IsNullOrEmpty(origin) && !String.Equals(origin, expectedOrigin, StringComparison.OrdinalIgnoreCase))
                            { WriteText(stream, 403, "Forbidden", "{\"ok\":false,\"error\":\"Origin is not allowed\"}", "application/json; charset=utf-8", null); return; }
                            string jsonText = new UTF8Encoding(false, true).GetString(requestBody);
                            string trimmed = jsonText.Trim();
                            if (!trimmed.StartsWith("{") || !trimmed.EndsWith("}") || trimmed.IndexOf("\"WEBOS-LOGIN\"", StringComparison.Ordinal) < 0 || trimmed.IndexOf("\"users\"", StringComparison.Ordinal) < 0 || trimmed.IndexOf("\"systemAccounts\"", StringComparison.Ordinal) < 0)
                            { WriteText(stream, 400, "Bad Request", "{\"ok\":false,\"error\":\"Invalid WEBOS login database format\"}", "application/json; charset=utf-8", null); return; }
                            lock (loginLock)
                            {
                                string temp = loginPath + ".tmp-" + Guid.NewGuid().ToString("N");
                                File.WriteAllBytes(temp, requestBody);
                                if (File.Exists(loginPath))
                                {
                                    try { File.Replace(temp, loginPath, null); }
                                    catch { File.Copy(temp, loginPath, true); File.Delete(temp); }
                                }
                                else File.Move(temp, loginPath);
                            }
                            WriteText(stream, 200, "OK", "{\"ok\":true,\"file\":\"login.json\"}", "application/json; charset=utf-8", new Dictionary<string, string> { { "Cache-Control", "no-store" } });
                            return;
                        }
                        WriteText(stream, 405, "Method Not Allowed", "{\"ok\":false,\"error\":\"Method not allowed\"}", "application/json; charset=utf-8", null);
                        return;
                    }

                    if (method != "GET" && method != "HEAD") { WriteText(stream, 405, "Method Not Allowed", "Method not allowed", "text/plain; charset=utf-8", null); return; }
                    string relative = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                    if (String.IsNullOrEmpty(relative)) relative = "WEBOS.html";
                    string fullPath = Path.GetFullPath(Path.Combine(root, relative));
                    if (!fullPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase) && !String.Equals(fullPath, Path.Combine(root, "WEBOS.html"), StringComparison.OrdinalIgnoreCase))
                    { WriteText(stream, 403, "Forbidden", "Forbidden", "text/plain; charset=utf-8", null); return; }
                    if (Directory.Exists(fullPath)) fullPath = Path.Combine(fullPath, "WEBOS.html");
                    if (!File.Exists(fullPath)) { WriteText(stream, 404, "Not Found", "Not found", "text/plain; charset=utf-8", null); return; }

                    FileInfo info = new FileInfo(fullPath);
                    long start = 0, end = info.Length - 1;
                    int status = 200; string reason = "OK";
                    Dictionary<string, string> extra = new Dictionary<string, string> { { "Accept-Ranges", "bytes" }, { "Cache-Control", "no-cache" } };
                    string range = headers.ContainsKey("Range") ? headers["Range"] : null;
                    if (!String.IsNullOrEmpty(range) && info.Length > 0)
                    {
                        Match match = Regex.Match(range, @"^bytes=(\d*)-(\d*)$");
                        if (match.Success)
                        {
                            if (match.Groups[1].Value.Length == 0)
                            {
                                long suffix; if (Int64.TryParse(match.Groups[2].Value, out suffix) && suffix > 0) start = Math.Max(0, info.Length - suffix);
                            }
                            else Int64.TryParse(match.Groups[1].Value, out start);
                            if (match.Groups[2].Value.Length > 0) Int64.TryParse(match.Groups[2].Value, out end);
                            if (start < 0 || start >= info.Length || end < start) { WriteText(stream, 416, "Range Not Satisfiable", "Range not satisfiable", "text/plain; charset=utf-8", new Dictionary<string, string> { { "Content-Range", "bytes */" + info.Length.ToString() } }); return; }
                            end = Math.Min(end, info.Length - 1); status = 206; reason = "Partial Content";
                            extra["Content-Range"] = "bytes " + start.ToString() + "-" + end.ToString() + "/" + info.Length.ToString();
                        }
                    }
                    long count = info.Length == 0 ? 0 : end - start + 1;
                    WriteHeaders(stream, status, reason, MimeType(fullPath), count, extra);
                    if (method == "HEAD" || count == 0) return;
                    using (FileStream file = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                    {
                        file.Seek(start, SeekOrigin.Begin);
                        byte[] buffer = new byte[64 * 1024];
                        long remaining = count;
                        while (remaining > 0)
                        {
                            int read = file.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                            if (read <= 0) break;
                            stream.Write(buffer, 0, read);
                            remaining -= read;
                        }
                    }
                }
            }
            catch { /* Client closed or malformed request; leave the local service alive. */ }
        }
    }
}
'@

Add-Type -TypeDefinition $source
$server = New-Object -TypeName WebosLocalServer -ArgumentList $PSScriptRoot, $port
$server.Start()
while ($true) { Start-Sleep -Seconds 60 }
