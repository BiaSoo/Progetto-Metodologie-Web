const express = require('express');
const path = require('path');
const db = require('./database');
const app = express();
const port = 3000;

// Configura il motore di template EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve i file statici dalla cartella 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Route per la pagina principale
app.get('/', (req, res) => {
    db.all('SELECT * FROM Prodotti WHERE Disponibile = 1', (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti');
        }
        res.render('index', { products: rows });
    });
});

// Route per la pagina del catalogo prodotti
app.get('/prodotti', (req, res) => {
    db.all('SELECT * FROM Prodotti WHERE Disponibile = 1', (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti');
        }
        res.render('catalogo', { products: rows });
    });
});

// Route per la pagina del carrello
app.get('/carrello', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'carrello.html'));
});

// Route dinamica per i dettagli del prodotto
app.get('/prodotti/:id', (req, res) => {
    db.get('SELECT * FROM Prodotti WHERE ID = ? AND Disponibile = 1', [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).send('Errore nel recupero del prodotto');
        }
        if (!row) {
            return res.status(404).send('Prodotto non trovato');
        }
        res.render('prodotto', { product: row });
    });
});

app.listen(port, () => {
    console.log(`Server in ascolto su http://localhost:${port}`);
});