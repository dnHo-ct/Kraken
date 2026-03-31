const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static(path.join(__dirname, "public")));

app.post("/upload-charts", upload.array("charts"), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.json({ message: "Aucun fichier reçu." });
    }

    console.log(
        "Graphiques reçus :",
        req.files.map(f => f.originalname)
    );

    res.json({
        message: `${req.files.length} graphique(s) reçu(s) avec succès.`
    });
});

app.post("/analyze", (req, res) => {
    const data = req.body;
    res.json({
        status: "success",
        analysis: "Résultat de ton analyse ici..."
    });
});

const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => {
    console.log("Serveur SENTINEL actif sur le port", PORT);
});
