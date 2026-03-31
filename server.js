const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/analyze', (req, res) => {
    const data = req.body;
    res.json({
        status: 'success',
        analysis: 'Résultat de ton analyse ici...'
    });
});

const port = 5000;
app.listen(port, '0.0.0.0', () => {
    console.log(`Serveur lancé sur http://0.0.0.0:${port}`);
});
