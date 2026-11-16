WEBOS – MODULAR BUILD 35
========================

A WEBOS Build 33 funkcionális és vizuális alapja változatlan. Ez a kiadás a korábbi egyetlen HTML-fájlt külön HTML komponensekre, CSS állományokra, JavaScript modulokra és JSON-adatfájlokra bontja.

INDÍTÁS
-------
1. Csomagold ki a ZIP teljes tartalmát egy állandó mappába.
2. Indítsd a START_WEBOS_CHROME_KIOSK.bat fájlt. Edge: START_WEBOS_EDGE_KIOSK.bat. Firefox: START_WEBOS_FIREFOX_KIOSK.bat.
3. A helyi WEBOS szolgáltatás kiszolgálja a HTML komponenseket, stíluslapokat, JavaScript fájlokat és JSON adatokat a 127.0.0.1:18767 címen.
4. A Content tárhely automatikusan a C:\WebosContentFolder\Content útvonalat használja. A WEBOS indító BAT-fájlja létrehozza a mappát, ha még nem létezik.

MODULÁRIS FELÉPÍTÉS
-------------------
WEBOS.html                  Vékony indító HTML és CSS hivatkozások
assets/html/                Az összes alkalmazás és rendszerfelület külön HTML részletben (a Contact Search külön overlay)
assets/css/                 tizenkilenc, sorrendben betöltött, funkciók szerint bontott stíluslap
assets/js/                  Indító, bejelentkezés, háttér, fiókkezelés és zenelejátszó
assets/js/runtime/          A közös alkalmazásfuttató logikájának tizennégy rendezett része
system/module-manifest.json Betöltési sorrend és moduljegyzék
system/runtime-parts.json  A megosztott futtatómag részeinek sorrendje
system/content-structure.json Content mappastruktúra és főmappa-ikonok metaadatai
system/pdf-fonts.json      A PDF-export beágyazott betűkészlet-adatainak külön JSON állománya
login.json                 Rendszerfiókok és felhasználói fiókok adatbázisa
Content/                   A WEBOS induló Content mappastruktúrája

FONTOS MŰKÖDÉSI RÉSZLET
-----------------------
A tizennégy runtime-rész ugyanannak a belső JavaScript hatókörnek a rendezett, alkalmazásfunkciók szerint szétválasztott forrásdarabja. A bootstrap ezeket egyetlen Blob-alapú scriptként állítja össze. Ez szándékos: a File Manager, Contact Manager, Event Studio, Converter és a többi funkció jelenleg megosztott állapotot és függvényeket használ. A darabolás így megőrzi az eredeti közös változókat, inicializálási sorrendet és működést; nem történik eval vagy new Function hívás.

A PDF-export valódi A1-es álló oldalméretet használ. A DOCX ugyanazt az adattartalmat, oszlopsorrendet, tördelést és A1-es oldalarányt tartja meg, Word-kompatibilis 22 hüvelykes oldalmagasságra méretezve. A Word-fájl szerkeszthető; A1 nyomtatásnál a nyomtatási méretet A1-re kell állítani.

MTI.HU
------
Az MTI.HU indító parancsikonját (mti.ink vagy Windows mti.lnk) tedd a WEBOS.html mellé, ha a gépen használni szeretnéd. A helyi szolgáltatás továbbra is csak ezt a szomszédos parancsikont indítja.

KOMPATIBILITÁS
-------------
A teljes helyi fájlrendszeres Content-kezeléshez és a login.json szolgáltatáson keresztüli írásához a mellékelt helyi szolgáltatást indító BAT használata szükséges. A Content állandó helye: C:\WebosContentFolder\Content. A csatlakoztatás a WEBOS felületén egyetlen gombbal történik; nincs szükség mappakeresésre vagy böngészős mappaválasztóra. Az exportmappák automatikusan létrejönnek: Event\Event Export\Word és Event\Event Export\PDF; MTI Collect\JSON IMPORT, valamint MTI Collect\EXPORT\Word és MTI Collect\EXPORT\PDF. A korábbi MTI PDF EXPORT tartalma csatlakozáskor átkerül az új EXPORT\PDF mappába.

Verzió: WEBOS Modular Build 35
Alap: WEBOS Build 33


Build 35 újdonságok:
- Rövidített felületi szövegek.
- PDF és DOCX export az Event és MTI modulban.
- Kilépés előtti megerősítés és rövidített leállítás.
