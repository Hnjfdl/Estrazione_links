const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const fs = require('fs');

// Funzione per autenticare Google Sheets
const authenticateGoogleSheets = async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json', // Il file di credenziali scaricato da Google Cloud
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
};

// Funzione per leggere il "Dato A" dal Google Sheet
const getDatoA = async (auth, spreadsheetId, range) => {
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return response.data.values[0][0]; // Restituisce il valore della cella
};

// Funzione per scrivere i "Dati B" nel Google Sheet
const writeDatiB = async (auth, spreadsheetId, range, data) => {
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW', // Scrive i dati come testo semplice
    requestBody: { values: data.map(link => [link]) }, // Trasforma l'array di link in un formato accettabile
  });
};

// Script principale
(async () => {
  let browser;
  try {
    // ID del Google Sheet e intervalli specificati
    const spreadsheetId = '1HpHoS1D1QxfYJT9EdKbgMij0nwVAYlWO_vto_NQLXVI'; // Sostituisci con il tuo Sheet ID
    const rangeInput = 'Foglio1!A12'; // Cella contenente il "Dato A"
    const rangeOutput = 'Foglio1!A14:A'; // Colonna in cui scrivere i "Dati B", a partire dalla riga 14

    // Autenticazione Google Sheets
    const auth = await authenticateGoogleSheets();

    // Recupera il "Dato A" (link base) dal Google Sheet
    const baseUrl = await getDatoA(auth, spreadsheetId, rangeInput);
    console.log('Dato A (baseUrl) ottenuto:', baseUrl);

    // Avvia Puppeteer
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    let allLinks = [];
    let currentPage = 1;

    while (true) {
      const url = `${baseUrl}&pag=${currentPage}`;
      console.log('Navigating to page', currentPage, ':', url);

      await page.goto(url, { waitUntil: 'load' });

      // Verifica se il contenuto è presente
      const contentAvailable = await page.evaluate(() => {
        const ul = document.querySelector('ul.nd-list.in-searchLayoutList.ls-results');
        return ul !== null;
      });

      if (!contentAvailable) {
        console.log('Nessun contenuto trovato. Fine paginazione.');
        break;
      }

      // Estrai i link degli annunci
      const links = await page.evaluate(() => {
        const ul = document.querySelector('ul.nd-list.in-searchLayoutList.ls-results');
        if (ul) {
          return Array.from(ul.querySelectorAll('a')).map(a => a.href.trim());
        }
        return [];
      });

      const filteredLinks = links.filter(href =>
        href.startsWith('https://www.immobiliare.it/annunci/')
      );

      console.log(`Trovati ${filteredLinks.length} link nella pagina ${currentPage}.`);
      allLinks.push(...filteredLinks);

      currentPage++;
      await new Promise(resolve => setTimeout(resolve, 3000)); // Pausa per evitare blocchi
    }

    // Scrivi i "Dati B" nel Google Sheet
    console.log(`Scrivendo ${allLinks.length} link nel Google Sheet...`);
    await writeDatiB(auth, spreadsheetId, rangeOutput, allLinks);
    console.log('Scrittura completata!');

  } catch (error) {
    console.error('Errore durante il processo:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
