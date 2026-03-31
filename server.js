const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static(path.join(__dirname, "public")));

async function analyseGraphique(filePath, fileName) {
    return {
        file: fileName,
        orderBlock: "OB Haut",
        fiboZone: "61.8% - 79%",
        volumeProfile: { VAL: 4200, POC: 4300, VAH: 4400 },
        rsi: { value: 55, divergence: "Aucune" },
        macd: { signal: "Achat léger", cross: true },
        cvd: { pression: "Achat dominant", delta: 1500 },
        obpi: { niveau: "Haute pression acheteurs", zone: "Grille OTE" },
        microStructure: "Engulfing",
        algorithmicZone: "OTE validée"
    };
}

app.post("/upload-charts", upload.array("charts"), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.json({ message: "Aucun fichier reçu." });
    }

    console.log("Graphiques reçus :", req.files.map(f => f.originalname));

    const results = [];

    for (const file of req.files) {
        const filePath = path.join(__dirname, file.path);

        const aiData = await analyseGraphique(filePath, file.originalname);

        let verdict;
        if (aiData.macd.signal.includes("Achat") && aiData.rsi.value < 70) verdict = "Achat";
        else if (aiData.macd.signal.includes("Vente") && aiData.rsi.value > 30) verdict = "Vente";
        else verdict = "Neutre";

        const sl = aiData.orderBlock === "OB Haut" ? aiData.volumeProfile.VAL - 10 : aiData.volumeProfile.VAL + 10;
        const tp1 = aiData.volumeProfile.POC;
        const tp2 = aiData.volumeProfile.VAH;

        results.push({
            ...aiData,
            verdict,
            SL: sl,
            TP1: tp1,
            TP2: tp2
        });

        fs.unlinkSync(filePath);
    }

    res.json({
        message: `${req.files.length} graphique(s) analysé(s) avec verdict complet.`,
        data: results
    });
});

app.post("/analyze", express.json(), (req, res) => {
    res.json({
        status: "success",
        analysis: "Résultat de ton analyse ici..."
    });
});

const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => {
    console.log("Serveur SENTINEL FULL actif sur le port", PORT);
});
