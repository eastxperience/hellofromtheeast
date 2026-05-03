/**
 * EastXperience · Kanha Fleet · Live Availability Apps Script
 * Spreadsheet ID: 1IdDDGaVjmNG1XOdQEb3tm-g4d9hBgTiydm8TDOSuNQA
 *
 * DEPLOY: Extensions → Apps Script → New Deployment → Web App
 * Execute as: Me | Access: Anyone
 * API: GET /exec?boat=Loka (or Citta, Natha, or blank for all)
 */

const SPREADSHEET_ID = '1IdDDGaVjmNG1XOdQEb3tm-g4d9hBgTiydm8TDOSuNQA';
const YEAR = 2026;
const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
const MONTH_NAMES_EN = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const MONTH_NAMES_ID = ['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];

const BOAT_CONFIG = {
  'kanha-loka':  { boatParam:'loka',  otRow:7,  cabins:{'share-cabin-1':8,'share-cabin-2':9,'share-cabin-3':10,'share-cabin-4':11,'superior-cabin-1':12,'superior-cabin-2':13,'deluxe-ocean-view-1':14,'deluxe-ocean-view-2':15,'family-cabin':16,'master-ocean-view':17} },
  'kanha-natha': { boatParam:'natha', otRow:20, cabins:{'share-cabin-1':21,'share-cabin-2':25,'private-ocean-view-1':29,'private-ocean-view-2':30} },
  'kanha-citta': { boatParam:'citta', otRow:33, cabins:{'share-room-1':34,'share-room-2':38,'deluxe-ocean-view-1':40,'deluxe-ocean-view-2':41,'deluxe-ocean-view-3':43,'shakti-room':44,'sedana-room':45,'gayatri-room':46} }
};

function doGet(e) {
  try {
    const boatParam = (e&&e.parameter&&e.parameter.boat) ? e.parameter.boat.trim().toLowerCase() : '';
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = findBookingSheet(ss);
    if (!sheet) throw new Error('Could not find 2026 booking chart sheet');
    const dateColMap = buildDateColMap(sheet);
    if (Object.keys(dateColMap).length===0) throw new Error('Could not parse date columns from sheet');
    const legendColors = readLegendColors(sheet);
    const boats = [];
    for (const [boatId,config] of Object.entries(BOAT_CONFIG)) {
      if (boatParam && boatParam!==config.boatParam && boatParam!==boatId) continue;
      boats.push({ id:boatId, departures:readBoatDepartures(sheet,config,dateColMap,legendColors) });
    }
    return jsonOut({ boats, spreadsheetId:SPREADSHEET_ID, sheetName:sheet.getName(), generatedAt:new Date().toISOString(), datesFound:Object.keys(dateColMap).length, source:'live' });
  } catch(err) { return jsonOut({ error:err.toString(), boats:[], source:'error' }); }
}

function findBookingSheet(ss) {
  const sheets = ss.getSheets();
  for (const s of sheets) { if (s.getName()==='Booking Chart 2026') return s; }
  for (const s of sheets) { const n=s.getName().toLowerCase(); if (n.includes('booking')&&n.includes('2026')) return s; }
  for (const s of sheets) { if (s.getName().toLowerCase().includes('2026')) return s; }
  return sheets.length>0 ? sheets[0] : null;
}

function buildDateColMap(sheet) {
  const lastCol = sheet.getLastColumn();
  const row3 = sheet.getRange(3,1,1,lastCol).getValues()[0];
  const row5 = sheet.getRange(5,1,1,lastCol).getValues()[0];
  const monthStartCols = {};
  for (let ci=0; ci<row3.length; ci++) {
    const cell = String(row3[ci]).toLowerCase().trim();
    if (!cell) continue;
    const enIdx=MONTH_NAMES_EN.indexOf(cell), idIdx=MONTH_NAMES_ID.indexOf(cell);
    const mIdx = enIdx>=0?enIdx:idIdx;
    if (mIdx>=0&&!(mIdx+1 in monthStartCols)) monthStartCols[mIdx+1]=ci;
  }
  const dateColMap = {};
  const sortedMonths = Object.keys(monthStartCols).map(Number).sort((a,b)=>a-b);
  for (let mi=0; mi<sortedMonths.length; mi++) {
    const month=sortedMonths[mi], startCi=monthStartCols[month], maxDays=MONTH_DAYS[month-1];
    const endCi = (mi+1<sortedMonths.length)?monthStartCols[sortedMonths[mi+1]]:lastCol;
    let dayExpected=1;
    for (let ci=startCi; ci<endCi&&dayExpected<=maxDays; ci++) {
      const dayVal=parseInt(row5[ci]);
      if (dayVal===dayExpected) { dateColMap[YEAR+'-'+String(month).padStart(2,'0')+'-'+String(dayExpected).padStart(2,'0')]=ci; dayExpected++; }
    }
  }
  return dateColMap;
}

function readLegendColors(sheet) {
  try { const colors=sheet.getRange(3,1,2,4).getBackgrounds(); return {booked:firstNonWhite(colors[0]),on_hold:firstNonWhite(colors[1])}; }
  catch(e) { return {booked:null,on_hold:null}; }
}
function firstNonWhite(arr) { const skip=new Set(['#ffffff','#ffffffff','white','']); for (const c of arr){if(c&&!skip.has(String(c).toLowerCase()))return c;} return null; }

function readBoatDepartures(sheet, config, dateColMap, legendColors) {
  const lastCol=sheet.getLastColumn(), cabinIds=Object.keys(config.cabins), cabinRows=cabinIds.map(id=>config.cabins[id]);
  if (!cabinRows.length) return [];
  const otVals=sheet.getRange(config.otRow,1,1,lastCol).getValues()[0];
  const minRow=Math.min(...cabinRows), maxRow=Math.max(...cabinRows);
  const allBGs=sheet.getRange(minRow,1,maxRow-minRow+1,lastCol).getBackgrounds();
  const colToDate={}; for (const [ds,ci] of Object.entries(dateColMap)) colToDate[ci]=ds;
  const departures=[];
  for (let ci=0; ci<otVals.length; ci++) {
    const marker=String(otVals[ci]).trim().toUpperCase(); if (!marker) continue;
    const isOT=marker==='OT'||marker.startsWith('OT');
    const isPrivate=marker.includes('PRIVATE')||marker.includes('CHARTER');
    const isMaint=marker.includes('DOCKING')||marker.includes('MAINTENAN');
    if (!isOT&&!isPrivate&&!isMaint) continue;
    const dateStr=colToDate[ci]; if (!dateStr) continue;
    const cabinStatuses=cabinIds.map((cabinId,i)=>{
      let status;
      if (isPrivate) status='private_charter';
      else if (isMaint) status='maintenance';
      else { const rowIdx=cabinRows[i]-minRow; const bg=(rowIdx>=0&&rowIdx<allBGs.length)?allBGs[rowIdx][ci]:null; status=colorToStatus(bg,legendColors); }
      return {id:cabinId,status};
    });
    departures.push({departureDate:dateStr,cabins:cabinStatuses});
  }
  departures.sort((a,b)=>a.departureDate.localeCompare(b.departureDate));
  return departures;
}

function colorToStatus(bg, legendColors) {
  if (!bg||bg==='#ffffff'||bg==='#ffffff'ff||bg==='white') return 'available';
  if (legendColors.booked&&bg===legendColors.booked) return 'booked';
  if (legendColors.on_hold&&bg===legendColors.on_hold) return 'on_hold';
  let r=255,g=255,b=255;
  try{r=parseInt(bg.slice(1,3),16);g=parseInt(bg.slice(3,5),16);b=parseInt(bg.slice(5,7),16);}catch(e){return 'available';}
  if (r>=150&&g<100&&b<100) return 'booked';
  if (r>=180&&g<130&&b<130&&r-g>70) return 'booked';
  if (r>=200&&g>=140&&b<100) return 'on_hold';
  if (r>=220&&g>=180&&b<120) return 'on_hold';
  if (b>=150&&r>=80&&g<80) return 'private_charter';
  if (r<80&&g<80&&b<80) return 'not_operating';
  if (r>=200&&g>=200&&b>=200) return 'available';
  return 'unknown';
}

function jsonOut(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function verify() {
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID), sheet=findBookingSheet(ss);
  Logger.log('Sheet: '+(sheet?sheet.getName():'NULL'));
  const dMap=buildDateColMap(sheet), dates=Object.keys(dMap).sort();
  Logger.log('Dates: '+dates.length+' | First: '+dates[0]+' | Last: '+dates[dates.length-1]);
  const legend=readLegendColors(sheet);
  Logger.log('Booked color: '+legend.booked+' | OnHold: '+legend.on_hold);
}
