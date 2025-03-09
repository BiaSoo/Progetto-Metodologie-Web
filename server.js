const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Serve i file statici dalla cartella 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Route per la pagina principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server in ascolto su http://localhost:${port}`);
});