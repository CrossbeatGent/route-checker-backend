const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// De proxy-functie die we gaan gebruiken. Deze is vaak betrouwbaarder.
const buildProxyUrl = (targetUrl) => `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

const DATA_SOURCES = [
    { 
        name: 'GIPOD (Vlaanderen)', 
        url: buildProxyUrl('https://api.gipod.vlaanderen.be/v1/innames'),
        parser: (item) => ({ 
            id: item.gipodId, 
            omschrijving: item.omschrijving, 
            aard: item.gipodType.label, 
            van: item.startDateTime, 
            tot: item.eindDateTime, 
            coords: item.geometrie.coordinates,
            sourceName: 'GIPOD (Vlaanderen)'
        }) 
    },
    {
        name: 'BRUGIS (Brussel)',
        url: buildProxyUrl('https://datastore.brussels/web/files/shortterm/road/RoadEvents.json'),
        parser: (item) => ({
            id: item.id,
            omschrijving: item.longDescription?.nl || item.shortDescription?.nl || 'Geen details',
            aard: item.subCategory?.nl || 'Onbekend',
            van: item.startTime,
            tot: item.endTime,
            coords: [item.location.longitude, item.location.latitude],
            sourceName: 'BRUGIS (Brussel)'
        })
    }
];

app.get('/api/interruptions', async (req, res) => {
    console.log('Verzoek ontvangen om data op te halen via de backend (v3)...');

    const fetchWithHeaders = (url) => {
        return fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
    };

    const promises = DATA_SOURCES.map(source =>
        fetchWithHeaders(source.url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Fout bij ophalen van ${source.name} via proxy: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                const features = data.features || data;
                if (!Array.isArray(features)) {
                    console.error(`Onverwachte data structuur van ${source.name}:`, data);
                    return [];
                };
                return features.map(source.parser);
            })
            .catch(error => {
                console.error(`Kon data van ${source.name} niet laden:`, error.message);
                return [];
            })
    );

    try {
        const results = await Promise.all(promises);
        const combinedData = results.flat();
        
        const uniqueInterruptions = new Map();
        combinedData.forEach(item => {
            if (item.coords && item.coords.length === 2) {
                const key = JSON.stringify(item.coords);
                if (!uniqueInterruptions.has(key)) {
                    uniqueInterruptions.set(key, item);
                }
            }
        });

        const finalData = Array.from(uniqueInterruptions.values());
        console.log(`Data succesvol opgehaald. ${finalData.length} unieke items gevonden.`);
        res.json(finalData);

    } catch (error) {
        console.error("Algemene fout in de backend:", error);
        res.status(500).json({ error: 'Interne serverfout' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server draait op poort ${PORT}`);
});
