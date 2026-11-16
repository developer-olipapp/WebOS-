
  // EXPORT MANAGEMENT — offline, embedded-font PDF export.
  
  

  // PDF font payloads are stored separately in system/pdf-fonts.json.
  let pdfFontDataPromise = null;
  async function loadPdfFontData() {
    if (!pdfFontDataPromise) {
      pdfFontDataPromise = fetch('./system/pdf-fonts.json', { cache: 'force-cache' })
        .then(response => { if (!response.ok) throw new Error('A PDF betűkészlet-adatfájl nem tölthető be.'); return response.json(); })
        .then(data => { if (!data || data.format !== 'WEBOS-PDF-FONTS' || !data.regularBase64 || !data.boldBase64) throw new Error('A PDF betűkészlet-adatfájl sérült.'); return data; })
        .catch(error => { pdfFontDataPromise = null; throw error; });
    }
    return pdfFontDataPromise;
  }

  let exportCloseTimer = 0;

  function setExportStatus(message) {
    const node=$('export-status');
    if(node)node.textContent=String(message||'');
  }
  function runExportSafe(fn) {
    return Promise.resolve().then(fn).catch(error=>{
      console.error('Export Management hiba:',error);
      setExportStatus(error&&error.message?error.message:'Az exportálás nem sikerült.');
      reportOperationFailure('Export Management',error);
    });
  }
  function setEventExportButtonsDisabled(disabled) {
    const pdf=$('export-run'),word=$('export-word');
    if(pdf)pdf.disabled=!!disabled;if(word)word.disabled=!!disabled;
  }
  function populateExportFolderSelect() {
    const select=$('export-folder-select');
    if(!select)return;
    const previous=select.value;
    select.replaceChildren();
    const first=document.createElement('option');
    first.value='';first.textContent='Válassz exportálandó mappát…';select.append(first);
    for(const folder of eventFolders) {
      const option=document.createElement('option');
      option.value=folder.name;option.textContent=folder.name;select.append(option);
    }
    if(eventFolders.some(x=>x.name===previous))select.value=previous;
    setEventExportButtonsDisabled(!select.value||!state.eventExportDir);
    updateExportDestinationPreview();
  }
  function updateExportDestinationPreview() {
    const folder=$('export-folder-select')?.value||'';
    const date=folder&&parseEventFolderDate(folder)?folder:'ÉÉÉÉ.HH.NN';
    $('export-destination').textContent='PDF: '+date+'.pdf  ·  WORD: '+date+'.docx';
    setEventExportButtonsDisabled(!folder||!state.eventExportDir);
  }
  function openConverterHome(){
    openUtilityWindow('converter-home-window','converter','⇄ Converter');
  }
  function closeConverterHome(){closeUtilityWindow('converter-home-window','converter');}
  function selectConverterMode(mode){
    closeConverterHome();
    if(mode==='mti')openMtiConverter();
    if(mode==='event')openExportManagement();
  }
  function openExportManagement() {
    const win=$('export-management-window');
    win.classList.remove('closing','app-minimized');
    registerTask('export-management','⇧ Export Management',()=>{
      if(win.classList.contains('app-minimized'))restoreExportManagement();
      else minimizeExportManagement();
    });
    bringAppToFront(win);
    void win.offsetWidth;win.classList.add('open');setTaskActive('export-management',true);
    $('export-disconnected').hidden=!!state.eventExportDir;
    if(state.eventExportDir)runExportSafe(async()=>{await reloadEventFolders();populateExportFolderSelect();setExportStatus('Válassz egy célmappát az exportáláshoz.');});
    else {populateExportFolderSelect();setExportStatus('Előbb csatlakoztasd az WEBOS főmappáját.');}
  }
  function minimizeExportManagement() {
    const win=$('export-management-window');if(!win.classList.contains('open'))return;
    win.classList.add('app-minimized');setTaskActive('export-management',false);
  }
  function restoreExportManagement() {
    const win=$('export-management-window');win.classList.remove('app-minimized');bringAppToFront(win);setTaskActive('export-management',true);
  }
  function closeExportManagement() {
    const win=$('export-management-window');if(!win.classList.contains('open')&&!win.classList.contains('closing'))return;
    win.classList.remove('open');win.classList.add('closing');setTaskActive('export-management',false);
    window.clearTimeout(exportCloseTimer);
    exportCloseTimer=window.setTimeout(()=>{win.classList.remove('closing','app-minimized');removeTask('export-management');},240);
  }
  function decodeBase64Bytes(value) {
    const binary=atob(value),out=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
    return out;
  }
  function readU16(bytes,offset) {return (bytes[offset]<<8)|bytes[offset+1];}
  function readU32(bytes,offset) {return ((bytes[offset]<<24)>>>0)|(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3];}
  function findTrueTypeCmap(bytes) {
    const tableCount=readU16(bytes,4);let chosen=null;
    for(let i=0;i<tableCount;i++) {
      const p=12+i*16;
      const tag=String.fromCharCode(bytes[p],bytes[p+1],bytes[p+2],bytes[p+3]);
      if(tag!=='cmap')continue;
      const tableOffset=readU32(bytes,p+8),num=readU16(bytes,tableOffset+2);
      let format4=null;
      for(let j=0;j<num;j++) {
        const r=tableOffset+4+j*8,platform=readU16(bytes,r),encoding=readU16(bytes,r+2),subOffset=tableOffset+readU32(bytes,r+4);
        const format=readU16(bytes,subOffset);
        if(format===4&&platform===3&&(encoding===1||encoding===10))format4=subOffset;
      }
      chosen=format4;break;
    }
    if(chosen===null)throw new Error('A beágyazott betűtípus karaktertáblája nem olvasható.');
    return chosen;
  }
  function trueTypeGlyphIndex(bytes,cmapOffset,code) {
    if(code<0||code>0xffff)return 0;
    const segCount=readU16(bytes,cmapOffset+6)/2;
    const endBase=cmapOffset+14;
    const startBase=endBase+segCount*2+2;
    const deltaBase=startBase+segCount*2;
    const rangeBase=deltaBase+segCount*2;
    for(let i=0;i<segCount;i++) {
      const end=readU16(bytes,endBase+i*2);
      if(code>end)continue;
      const start=readU16(bytes,startBase+i*2);
      if(code<start)return 0;
      const delta=readU16(bytes,deltaBase+i*2);
      const range=readU16(bytes,rangeBase+i*2);
      if(range===0)return (code+((delta<<16)>>16))&0xffff;
      const glyphAddress=rangeBase+i*2+range+(code-start)*2;
      const glyph=readU16(bytes,glyphAddress);
      return glyph===0?0:(glyph+((delta<<16)>>16))&0xffff;
    }
    return 0;
  }
  function buildCidToGidMap(fontBytes) {
    const cmap=findTrueTypeCmap(fontBytes),map=new Uint8Array(65536*2);
    for(let code=0;code<65536;code++) {
      const glyph=trueTypeGlyphIndex(fontBytes,cmap,code);
      map[code*2]=(glyph>>>8)&255;map[code*2+1]=glyph&255;
    }
    return map;
  }
  function encodePdfTextHex(value) {
    const text=String(value??'').normalize('NFC');let out='';
    for(const char of text) {
      const cp=char.codePointAt(0);
      if(cp<=0xffff)out+=cp.toString(16).padStart(4,'0').toUpperCase();
      else out+='003F';
    }
    return out||'0000';
  }
  function wrapPdfCell(value,maxChars) {
    const source=String(value??'').replace(/\r\n?/g,'\n').replace(/\t/g,'    ').normalize('NFC');
    if(!source)return [''];
    const out=[];
    for(const rawLine of source.split('\n')) {
      if(rawLine===''){out.push('');continue;}
      const words=rawLine.split(/\s+/);let line='';
      for(const original of words) {
        let word=original;
        while(word.length>maxChars) {
          const room=maxChars-line.length-(line?1:0);
          if(room>0){line+=(line?' ':'')+word.slice(0,room);word=word.slice(room);}
          if(line){out.push(line);line='';}
          if(word.length>=maxChars){out.push(word.slice(0,maxChars));word=word.slice(maxChars);}
        }
        if(!word)continue;
        const test=line?(line+' '+word):word;
        if(test.length<=maxChars)line=test;
        else {if(line)out.push(line);line=word;}
      }
      if(line)out.push(line);
    }
    return out.length?out:[''];
  }
  function pdfAscii(value) {return new TextEncoder().encode(String(value));}
  function concatPdfBytes(parts) {
    const total=parts.reduce((sum,p)=>sum+p.length,0),out=new Uint8Array(total);let at=0;
    for(const p of parts){out.set(p,at);at+=p.length;}
    return out;
  }
  function pdfStreamObject(extraDict,bytes) {
    return concatPdfBytes([pdfAscii('<< '+extraDict+' /Length '+bytes.length+' >>\nstream\n'),bytes,pdfAscii('\nendstream')]);
  }
  function makeEmbeddedPdfFont(objects,fontBytes,fontName,face) {
    const fileId=objects.reserve(),descriptorId=objects.reserve(),mapId=objects.reserve(),cidFontId=objects.reserve(),unicodeId=objects.reserve(),type0Id=objects.reserve();
    const mapBytes=buildCidToGidMap(fontBytes);
    objects.set(fileId,pdfStreamObject('/Length1 '+fontBytes.length,fontBytes));
    const bbox=face.bbox.map(v=>Math.round(v*1000/2048)).join(' ');
    objects.set(descriptorId,pdfAscii('<< /Type /FontDescriptor /FontName /'+fontName+' /Flags 33 /FontBBox ['+bbox+'] /ItalicAngle 0 /Ascent '+Math.round(face.ascent*1000/2048)+' /Descent '+Math.round(face.descent*1000/2048)+' /CapHeight '+Math.round(face.capHeight*1000/2048)+' /StemV '+(face.bold?120:80)+' /FontFile2 '+fileId+' 0 R >>'));
    objects.set(mapId,pdfStreamObject('',mapBytes));
    objects.set(cidFontId,pdfAscii('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /'+fontName+' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor '+descriptorId+' 0 R /DW 602 /CIDToGIDMap '+mapId+' 0 R >>'));
    const cmap=' /CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfrange\n<0000> <FFFF> <0000>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    objects.set(unicodeId,pdfStreamObject('',pdfAscii(cmap)));
    objects.set(type0Id,pdfAscii('<< /Type /Font /Subtype /Type0 /BaseFont /'+fontName+' /Encoding /Identity-H /DescendantFonts ['+cidFontId+' 0 R] /ToUnicode '+unicodeId+' 0 R >>'));
    return type0Id;
  }
  async function makeAeroEventPdf(records,reportDate) {
    const fontData = await loadPdfFontData();
    const regular=decodeBase64Bytes(fontData.regularBase64),bold=decodeBase64Bytes(fontData.boldBase64);
    const objects={items:[null],reserve(){this.items.push(null);return this.items.length-1;},set(id,value){this.items[id]=value;}};
    const catalogId=objects.reserve(),pagesId=objects.reserve(),infoId=objects.reserve(),titleFontId=objects.reserve();
    objects.set(titleFontId,pdfAscii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
    const regularFontId=makeEmbeddedPdfFont(objects,regular,'DejaVuSansMono',{bbox:[-1144,-767,1470,2106],ascent:1901,descent:-483,capHeight:1493,bold:false});
    const boldFontId=makeEmbeddedPdfFont(objects,bold,'DejaVuSansMono-Bold',{bbox:[-915,-807,1499,2132],ascent:1901,descent:-483,capHeight:1493,bold:true});
    const pageW=1683.72,pageH=2383.92,margin=18,rightMargin=116,tableW=pageW-margin-rightMargin;
    const colWidths=[.168,.159,.161,.280,.232].map(x=>tableW*x);
    const xPos=[margin];for(const w of colWidths)xPos.push(xPos[xPos.length-1]+w);
    const fontSize=17.0,leading=22.0,padX=7,padY=21;
    const maxChars=colWidths.map(w=>Math.max(8,Math.floor((w-padX*2)/(fontSize*.602))));
    const pageOneCapacity=1690,pageNextCapacity=1900;
    const pageRows=[];let current={first:true,rows:[],used:0,capacity:pageOneCapacity};pageRows.push(current);
    const cellsForRecord=record=>[
      record.date?`${record.date.replace(/^(\d{4})\.(\d{2})\.(\d{2})$/,'$1. $2. $3.')}${record.time?' '+formatEventTimeLabel(record.time):''}`: '',
      record.place||'',record.nature||'',record.description||'',record.contact||''
    ];
    const sourceRecords=Array.isArray(records)?records:[];
    for(const record of sourceRecords) {
      const cellLines=cellsForRecord(record).map((v,i)=>wrapPdfCell(v,maxChars[i]));
      const maxLines=Math.max(1,...cellLines.map(a=>a.length));
      const totalHeight=maxLines*leading+padY*2;
      if(totalHeight<=current.capacity) {
        if(current.used+totalHeight>current.capacity){current={first:false,rows:[],used:0,capacity:pageNextCapacity};pageRows.push(current);}
        current.rows.push({cellLines,height:totalHeight});current.used+=totalHeight;
      } else {
        const linesPerFragment=Math.max(1,Math.floor((current.capacity-padY*2)/leading));let offset=0;
        while(offset<maxLines) {
          const chunks=cellLines.map(lines=>lines.slice(offset,offset+linesPerFragment));
          const chunkLines=Math.max(1,...chunks.map(a=>a.length));const chunkHeight=chunkLines*leading+padY*2;
          if(current.used+chunkHeight>current.capacity){current={first:false,rows:[],used:0,capacity:pageNextCapacity};pageRows.push(current);}
          current.rows.push({cellLines:chunks,height:chunkHeight});current.used+=chunkHeight;offset+=linesPerFragment;
        }
      }
    }
    const pageIds=[];
    const drawLine=(arr,x1,y1,x2,y2,width=.7,color='0 0 0')=>arr.push('q '+color+' RG '+width+' w '+x1.toFixed(2)+' '+y1.toFixed(2)+' m '+x2.toFixed(2)+' '+y2.toFixed(2)+' l S Q');
    const drawRect=(arr,x,top,w,h,fill)=>{const y=pageH-top-h;if(fill)arr.push('q '+fill+' rg '+x.toFixed(2)+' '+y.toFixed(2)+' '+w.toFixed(2)+' '+h.toFixed(2)+' re f Q');arr.push('q 0 0 0 RG 0.7 w '+x.toFixed(2)+' '+y.toFixed(2)+' '+w.toFixed(2)+' '+h.toFixed(2)+' re S Q');};
    const drawText=(arr,text,x,top,size,font,color='0 0 0',align='left',cellWidth=0)=>{
      const hex=encodePdfTextHex(text),estimated=String(text).length*size*.602;
      let xx=x;if(align==='center'&&cellWidth)xx=x+(cellWidth-estimated)/2;else if(align==='right'&&cellWidth)xx=x+cellWidth-estimated;
      const baseline=pageH-top-size;
      arr.push('BT /'+font+' '+size.toFixed(2)+' Tf '+color+' rg 1 0 0 1 '+xx.toFixed(2)+' '+baseline.toFixed(2)+' Tm <'+hex+'> Tj ET');
    };
    const winAnsiSpecial={0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F};
    const encodeWinAnsiHex=text=>Array.from(String(text),ch=>{const cp=ch.codePointAt(0);const code=winAnsiSpecial[cp]??(cp<=255?cp:63);return code.toString(16).padStart(2,'0').toUpperCase();}).join('');
    const drawStdText=(arr,text,x,top,size,font,color='0 0 0',align='center',cellWidth=0)=>{const hex=encodeWinAnsiHex(text);const estimated=String(text).length*size*.66;let xx=x;if(align==='center'&&cellWidth)xx=x+(cellWidth-estimated)/2;const baseline=pageH-top-size;arr.push('BT /'+font+' '+size.toFixed(2)+' Tf '+color+' rg 1 0 0 1 '+xx.toFixed(2)+' '+baseline.toFixed(2)+' Tm <'+hex+'> Tj ET');};
    for(let pageIndex=0;pageIndex<pageRows.length;pageIndex++) {
      const page=pageRows[pageIndex],commands=[];let top;
      if(page.first) {
        const titleTop=52,titleH=82,spacerH=62,headH=53;
        drawRect(commands,margin,titleTop,tableW,titleH,null);
        const dateDivider=xPos[4];drawLine(commands,dateDivider,pageH-titleTop,dateDivider,pageH-titleTop-titleH,.7);
        drawStdText(commands,'ESEMÉNYNAPLÓ',margin,titleTop+18,38,'F3','0 0 0','center',colWidths.slice(0,4).reduce((a,b)=>a+b,0));
        drawText(commands,reportDate, xPos[4]+8,titleTop+29,21,'F1');
        const spacerTop=titleTop+titleH;drawRect(commands,margin,spacerTop,tableW,spacerH,null);
        const headTop=spacerTop+spacerH;drawRect(commands,margin,headTop,tableW,headH,'0 0 0');
        let cx=margin;for(let i=0;i<colWidths.length;i++){
          if(i>0)drawLine(commands,cx,pageH-headTop,cx,pageH-headTop-headH,.7,'1 1 1');
          const labels=['IDŐ','HELY','RENDEZVÉNY','RENDEZVÉNY LEÍRÁSA','KAPCSOLAT'];
          drawText(commands,labels[i],cx+5,headTop+17,18.5,'F2','1 1 1','center',colWidths[i]);cx+=colWidths[i];
        }
        top=headTop+headH;
      } else top=0;
      for(const row of page.rows) {
        drawRect(commands,margin,top,tableW,row.height,null);
        let x=margin;
        for(let col=0;col<5;col++) {
          if(col>0)drawLine(commands,x,pageH-top,x,pageH-top-row.height,.65);
          const lines=row.cellLines[col]||[];const blockH=lines.length*leading;
          const firstTop=top+(row.height-blockH)/2+(leading-fontSize)*.34;
          for(let j=0;j<lines.length;j++) if(lines[j])drawText(commands,lines[j],x+padX,firstTop+j*leading,fontSize,'F1');
          x+=colWidths[col];
        }
        top+=row.height;
      }
      const contentBytes=pdfAscii(commands.join('\n')+'\n');
      const pageId=objects.reserve(),contentId=objects.reserve();pageIds.push(pageId);
      objects.set(contentId,pdfStreamObject('',contentBytes));
      objects.set(pageId,pdfAscii('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 '+pageW+' '+pageH+'] /Resources << /Font << /F1 '+regularFontId+' 0 R /F2 '+boldFontId+' 0 R /F3 '+titleFontId+' 0 R >> >> /Contents '+contentId+' 0 R >>'));
    }
    objects.set(pagesId,pdfAscii('<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pageIds.length+' >>'));
    objects.set(catalogId,pdfAscii('<< /Type /Catalog /Pages '+pagesId+' 0 R /Lang (hu-HU) >>'));
    objects.set(infoId,pdfAscii('<< /Title (ESEMENYNAPLO '+reportDate+') /Author (WEBOS) /Creator (WEBOS Export Management) /Producer (WEBOS Embedded PDF Engine) >>'));
    const parts=[pdfAscii('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n')],offsets=[0];let position=parts[0].length;
    for(let id=1;id<objects.items.length;id++) {
      const body=objects.items[id];if(!body)throw new Error('PDF objektum hiányzik: '+id);
      const prefix=pdfAscii(id+' 0 obj\n'),suffix=pdfAscii('\nendobj\n');offsets[id]=position;parts.push(prefix,body,suffix);position+=prefix.length+body.length+suffix.length;
    }
    const xrefPosition=position;let xref='xref\n0 '+objects.items.length+'\n0000000000 65535 f \n';
    for(let id=1;id<objects.items.length;id++)xref+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';
    parts.push(pdfAscii(xref+'trailer\n<< /Size '+objects.items.length+' /Root '+catalogId+' 0 R /Info '+infoId+' 0 R >>\nstartxref\n'+xrefPosition+'\n%%EOF'));
    return concatPdfBytes(parts);
  }
  function xmlEscape(value) {
    return String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }
  function utf8Bytes(value) { return new TextEncoder().encode(String(value)); }
  const DOCX_LAYOUT_SCALE=31680/(2383.92*20);
  const DOCX_BORDER_SIZE=Math.max(2,Math.round(6*DOCX_LAYOUT_SCALE));
  function writeZipU16(out,value) { out.push(value&255,(value>>>8)&255); }
  function writeZipU32(out,value) { out.push(value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255); }
  let docxCrcTable=null;
  function docxCrc32(bytes) {
    if(!docxCrcTable){docxCrcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);docxCrcTable[n]=c>>>0;}}
    let crc=0xFFFFFFFF;for(const byte of bytes)crc=docxCrcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xFFFFFFFF)>>>0;
  }
  function makeStoredZip(files) {
    const localParts=[],centralParts=[];let offset=0;const dosTime=0,dosDate=0x21;
    for(const file of files){
      const name=utf8Bytes(file.name),data=typeof file.data==='string'?utf8Bytes(file.data):file.data,crc=docxCrc32(data);
      const local=[];writeZipU32(local,0x04034B50);writeZipU16(local,20);writeZipU16(local,0x0800);writeZipU16(local,0);writeZipU16(local,dosTime);writeZipU16(local,dosDate);writeZipU32(local,crc);writeZipU32(local,data.length);writeZipU32(local,data.length);writeZipU16(local,name.length);writeZipU16(local,0);
      const localBytes=new Uint8Array(local.length+name.length+data.length);localBytes.set(local,0);localBytes.set(name,local.length);localBytes.set(data,local.length+name.length);localParts.push(localBytes);
      const central=[];writeZipU32(central,0x02014B50);writeZipU16(central,20);writeZipU16(central,20);writeZipU16(central,0x0800);writeZipU16(central,0);writeZipU16(central,dosTime);writeZipU16(central,dosDate);writeZipU32(central,crc);writeZipU32(central,data.length);writeZipU32(central,data.length);writeZipU16(central,name.length);writeZipU16(central,0);writeZipU16(central,0);writeZipU16(central,0);writeZipU16(central,0);writeZipU32(central,0);writeZipU32(central,offset);
      const centralBytes=new Uint8Array(central.length+name.length);centralBytes.set(central,0);centralBytes.set(name,central.length);centralParts.push(centralBytes);
      offset+=localBytes.length;
    }
    const centralSize=centralParts.reduce((sum,item)=>sum+item.length,0),end=[];writeZipU32(end,0x06054B50);writeZipU16(end,0);writeZipU16(end,0);writeZipU16(end,files.length);writeZipU16(end,files.length);writeZipU32(end,centralSize);writeZipU32(end,offset);writeZipU16(end,0);
    return concatPdfBytes([...localParts,...centralParts,new Uint8Array(end)]);
  }
  function docxRun(text,{size=17*DOCX_LAYOUT_SCALE,bold=false,color='000000'}={}) {
    const rPr='<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:eastAsia="Courier New" w:cs="Courier New"/>'+(bold?'<w:b/>':'')+'<w:color w:val="'+color+'"/><w:sz w:val="'+Math.round(size*2)+'"/><w:szCs w:val="'+Math.round(size*2)+'"/></w:rPr>';
    return '<w:r>'+rPr+'<w:t xml:space="preserve">'+xmlEscape(text||' ')+'</w:t></w:r>';
  }
  function docxParagraph(lines,{size=17*DOCX_LAYOUT_SCALE,bold=false,color='000000',align='left',line=22}={}) {
    const content=(Array.isArray(lines)?lines:[String(lines??'')]).map(text=>docxRun(text,{size,bold,color})).join('');
    return '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="'+Math.round(line*20)+'" w:lineRule="exact"/><w:jc w:val="'+align+'"/></w:pPr>'+content+'</w:p>';
  }
  function docxCell(lines,width,{gridSpan=1,height=0,fill='',fontSize=17*DOCX_LAYOUT_SCALE,bold=false,color='000000',align='left',line=22*DOCX_LAYOUT_SCALE,header=false,vertical='center'}={}) {
    const span=gridSpan>1?'<w:gridSpan w:val="'+gridSpan+'"/>':'';
    const shade=fill?'<w:shd w:val="clear" w:color="auto" w:fill="'+fill+'"/>':'';
    const edgeColor=header?'FFFFFF':'000000';
    const border='<w:tcBorders><w:top w:val="single" w:sz="'+DOCX_BORDER_SIZE+'" w:color="'+edgeColor+'"/><w:left w:val="single" w:sz="'+DOCX_BORDER_SIZE+'" w:color="'+edgeColor+'"/><w:bottom w:val="single" w:sz="'+DOCX_BORDER_SIZE+'" w:color="'+edgeColor+'"/><w:right w:val="single" w:sz="'+DOCX_BORDER_SIZE+'" w:color="'+edgeColor+'"/></w:tcBorders>';
    const tcPr='<w:tcPr><w:tcW w:w="'+width+'" w:type="dxa"/>'+span+shade+border+'<w:tcMar><w:top w:w="'+Math.round(420*DOCX_LAYOUT_SCALE)+'" w:type="dxa"/><w:left w:w="'+Math.round(140*DOCX_LAYOUT_SCALE)+'" w:type="dxa"/><w:bottom w:w="'+Math.round(420*DOCX_LAYOUT_SCALE)+'" w:type="dxa"/><w:right w:w="'+Math.round(140*DOCX_LAYOUT_SCALE)+'" w:type="dxa"/></w:tcMar><w:vAlign w:val="'+vertical+'"/><w:noWrap/></w:tcPr>';
    const values=Array.isArray(lines)?lines:[String(lines??'')];
    const paragraphs=values.map(value=>docxParagraph([value],{size:fontSize,bold,color,align,line})).join('');
    return '<w:tc>'+tcPr+paragraphs+'</w:tc>';
  }
  function docxTableRow(cells,height) {
    return '<w:tr><w:trPr><w:trHeight w:val="'+Math.round(height*20)+'" w:hRule="exact"/><w:cantSplit/></w:trPr>'+cells.join('')+'</w:tr>';
  }
  function docxTable(rows,columnWidths,totalWidth) {
    const grid='<w:tblGrid>'+columnWidths.map(width=>'<w:gridCol w:w="'+width+'"/>').join('')+'</w:tblGrid>';
    const borders='<w:tblBorders><w:top w:val="single" w:sz="'+DOCX_BORDER_SIZE+'" w:color="000000"/><w:left w:val="single" w:sz="'+DOCX_BORDER_SIZE+'" w:color="000000"/><w:bottom w:val="single" w:sz="'+DOCX_BORDER_SIZE+'" w:color="000000"/><w:right w:val="single" w:sz="'+DOCX_BORDER_SIZE+'" w:color="000000"/><w:insideH w:val="single" w:sz="'+DOCX_BORDER_SIZE+'" w:color="000000"/><w:insideV w:val="single" w:sz="'+DOCX_BORDER_SIZE+'" w:color="000000"/></w:tblBorders>';
    const props='<w:tblPr><w:tblW w:w="'+totalWidth+'" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>'+borders+'</w:tblPr>';
    return '<w:tbl>'+props+grid+rows.join('')+'</w:tbl>';
  }
  async function makeAeroEventDocx(records,reportDate) {
    const pageW=1683.72*DOCX_LAYOUT_SCALE,pageH=2383.92*DOCX_LAYOUT_SCALE,margin=18*DOCX_LAYOUT_SCALE,rightMargin=116*DOCX_LAYOUT_SCALE,tableW=pageW-margin-rightMargin;
    const fractions=[.168,.159,.161,.280,.232];
    const rawWidths=fractions.map(x=>tableW*x*20),columnWidths=rawWidths.map(Math.round);
    columnWidths[columnWidths.length-1]=Math.round(tableW*20)-columnWidths.slice(0,-1).reduce((a,b)=>a+b,0);
    const widthTotal=columnWidths.reduce((a,b)=>a+b,0),fontSize=17*DOCX_LAYOUT_SCALE,leading=22*DOCX_LAYOUT_SCALE,padX=7*DOCX_LAYOUT_SCALE,padY=21*DOCX_LAYOUT_SCALE;
    const maxChars=fractions.map((fraction)=>Math.max(8,Math.floor((tableW*fraction-padX*2)/(fontSize*.602))));
    const pageOneCapacity=1690*DOCX_LAYOUT_SCALE,pageNextCapacity=1900*DOCX_LAYOUT_SCALE;
    const pageRows=[];let current={first:true,rows:[],used:0,capacity:pageOneCapacity};pageRows.push(current);
    const cellsForRecord=record=>[
      record.date?`${record.date.replace(/^(\d{4})\.(\d{2})\.(\d{2})$/,'$1. $2. $3.')}${record.time?' '+formatEventTimeLabel(record.time):''}`:'',
      record.place||'',record.nature||'',record.description||'',record.contact||''
    ];
    for(const record of (Array.isArray(records)?records:[])) {
      const cellLines=cellsForRecord(record).map((value,index)=>wrapPdfCell(value,maxChars[index]));
      const maxLines=Math.max(1,...cellLines.map(lines=>lines.length));
      const totalHeight=maxLines*leading+padY*2;
      if(totalHeight<=current.capacity) {
        if(current.used+totalHeight>current.capacity){current={first:false,rows:[],used:0,capacity:pageNextCapacity};pageRows.push(current);}
        current.rows.push({cellLines,height:totalHeight});current.used+=totalHeight;
      } else {
        const linesPerFragment=Math.max(1,Math.floor((current.capacity-padY*2)/leading));let offset=0;
        while(offset<maxLines) {
          const chunks=cellLines.map(lines=>lines.slice(offset,offset+linesPerFragment));
          const chunkLines=Math.max(1,...chunks.map(lines=>lines.length));const chunkHeight=chunkLines*leading+padY*2;
          if(current.used+chunkHeight>current.capacity){current={first:false,rows:[],used:0,capacity:pageNextCapacity};pageRows.push(current);}
          current.rows.push({cellLines:chunks,height:chunkHeight});current.used+=chunkHeight;offset+=linesPerFragment;
        }
      }
    }
    const labels=['IDŐ','HELY','RENDEZVÉNY','RENDEZVÉNY LEÍRÁSA','KAPCSOLAT'];
    const documentParts=[];
    for(let pageIndex=0;pageIndex<pageRows.length;pageIndex++) {
      const page=pageRows[pageIndex],rows=[];
      if(pageIndex===0) {
        documentParts.push('<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="'+Math.round(1040*DOCX_LAYOUT_SCALE)+'" w:lineRule="exact"/></w:pPr><w:r><w:t></w:t></w:r></w:p>');
        rows.push(docxTableRow([
          docxCell(['ESEMÉNYNAPLÓ'],columnWidths.slice(0,4).reduce((a,b)=>a+b,0),{gridSpan:4,fontSize:38*DOCX_LAYOUT_SCALE,bold:true,align:'center',line:42*DOCX_LAYOUT_SCALE}),
          docxCell([reportDate],columnWidths[4],{fontSize:21*DOCX_LAYOUT_SCALE,align:'left',line:25*DOCX_LAYOUT_SCALE})
        ],82*DOCX_LAYOUT_SCALE));
        rows.push(docxTableRow([docxCell([''],widthTotal,{gridSpan:5,fontSize:1*DOCX_LAYOUT_SCALE,line:1*DOCX_LAYOUT_SCALE})],62*DOCX_LAYOUT_SCALE));
        rows.push(docxTableRow(labels.map((label,index)=>docxCell([label],columnWidths[index],{fill:'000000',fontSize:18.5*DOCX_LAYOUT_SCALE,bold:true,color:'FFFFFF',align:'center',line:22*DOCX_LAYOUT_SCALE,header:true})),53*DOCX_LAYOUT_SCALE));
      } else {
        documentParts.push('<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>');
      }
      for(const row of page.rows)rows.push(docxTableRow(row.cellLines.map((lines,index)=>docxCell(lines,columnWidths[index],{fontSize,bold:false,color:'000000',align:'left',line:leading})),row.height));
      documentParts.push(docxTable(rows,columnWidths,widthTotal));
    }
    const pageSize='<w:pgSz w:w="'+Math.round(pageW*20)+'" w:h="'+Math.round(pageH*20)+'"/>';
    const pageMargins='<w:pgMar w:top="0" w:right="'+Math.round(rightMargin*20)+'" w:bottom="0" w:left="'+Math.round(margin*20)+'" w:header="0" w:footer="0" w:gutter="0"/>';
    const finalSection='<w:sectPr>'+pageSize+pageMargins+'</w:sectPr>';
    const documentXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+documentParts.join('')+finalSection+'</w:body></w:document>';
    const stylesXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="'+Math.round(34*DOCX_LAYOUT_SCALE)+'"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="'+Math.round(34*DOCX_LAYOUT_SCALE)+'"/></w:rPr></w:style></w:styles>';
    const settingsXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:compat><w:doNotExpandShiftReturn/><w:doNotUseHTMLParagraphAutoSpacing/></w:compat></w:settings>';
    const relsRoot='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    const relsDoc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>';
    const contentTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    const coreXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>ESEMÉNYNAPLÓ '+xmlEscape(reportDate)+'</dc:title><dc:creator>WEBOS</dc:creator><cp:lastModifiedBy>WEBOS</cp:lastModifiedBy></cp:coreProperties>';
    const appXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>WEBOS</Application></Properties>';
    return makeStoredZip([
      {name:'[Content_Types].xml',data:contentTypes},
      {name:'_rels/.rels',data:relsRoot},
      {name:'docProps/core.xml',data:coreXml},
      {name:'docProps/app.xml',data:appXml},
      {name:'word/document.xml',data:documentXml},
      {name:'word/styles.xml',data:stylesXml},
      {name:'word/settings.xml',data:settingsXml},
      {name:'word/_rels/document.xml.rels',data:relsDoc}
    ]);
  }

  function determineExportDate(folderName,records) {
    if(parseEventFolderDate(folderName))return folderName;
    const dates=[];for(const record of records){try{const parsed=parseEventDate(record.date);if(parsed)dates.push(parsed.normalized);}catch(_){}}
    dates.sort((a,b)=>a.localeCompare(b));
    if(dates.length)return dates[0];
    return eventDateKey(new Date());
  }
  async function exportSelectedEventFolder(format='pdf') {
    if(!state.eventExportDir)throw new Error('Előbb csatlakoztasd a WEBOS főmappáját.');
    const folderName=$('export-folder-select').value;
    if(!folderName)throw new Error('Válassz célmappát.');
    const isWord=format==='docx',extension=isWord?'docx':'pdf',label=isWord?'WORD':'PDF',folderLabel=isWord?'Word':'PDF';
    setEventExportButtonsDisabled(true);setExportStatus('Exportálás…');
    try {
      await reloadEventFolders();
      const records=await readEventRecords(folderName);
      const exportDate=determineExportDate(folderName,records),reportDate=exportDate+'.';
      const bytes=isWord?await makeAeroEventDocx(records,reportDate):await makeAeroEventPdf(records,reportDate);
      const formatDir=isWord?state.eventWordExportDir:state.eventPdfExportDir;
      if(!formatDir)throw new Error('Az Event Export '+label+' mappája nem érhető el.');
      const exportDateDir=await formatDir.getDirectoryHandle(exportDate,{create:true});
      const fileName=exportDate+'.'+extension;
      const fileHandle=await exportDateDir.getFileHandle(fileName,{create:true});
      const writer=await fileHandle.createWritable();
      try {await writer.write(bytes);await writer.close();}
      catch(error){try{await writer.abort();}catch(_){}throw error;}
      if(state.contentRoot&&$('fm-window').classList.contains('open'))await refreshAll();
      setExportStatus(label+' export kész: '+fileName+' · '+records.length+' esemény');
      await recordActivity(isWord?'docx-exported':'pdf-exported',{source:'Event Studio',folder:folderName,fileName,records:records.length,path:'Content\\Event\\Event Export\\'+folderLabel+'\\'+exportDate+'\\'+fileName});
      notifyUser(label+' export sikeres',fileName+' · '+records.length+' esemény','success');
    } finally {setEventExportButtonsDisabled(!$('export-folder-select').value||!state.eventExportDir);}
  }