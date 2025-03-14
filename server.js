const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const app = express();
const port = 3000;

const saltRounds = 10;
const db = new sqlite3.Database('./database.db');

// Configurazione di multer per salvare le immagini nella cartella "public/images/prodotti"
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/images/prodotti')); // Cartella di destinazione
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); // Nome univoco per evitare conflitti
    }
});

const upload = multer({ storage });

// Configura il motore di template EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve i file statici dalla cartella 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// Configura il middleware per le sessioni
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// Creazione e popolamento delle tabelle al primo avvio
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS Utenti (
        Email TEXT NOT NULL UNIQUE,
        Password TEXT NOT NULL,
        Nome TEXT NOT NULL,
        Cognome TEXT NOT NULL,
        Indirizzo TEXT NOT NULL,
        NumeroDiTelefono TEXT NOT NULL,
        AccessoSpeciale BOOLEAN NOT NULL DEFAULT 0,
        PRIMARY KEY(Email)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Prodotti (
        ID INTEGER NOT NULL UNIQUE,
        Nome TEXT NOT NULL UNIQUE,
        Prezzo REAL NOT NULL,
        Quantita INTEGER NOT NULL,
        Categoria TEXT NOT NULL,
        Disponibile BOOLEAN NOT NULL DEFAULT 1,
        Immagine TEXT NOT NULL,
        Descrizione TEXT NOT NULL,
        PRIMARY KEY(ID AUTOINCREMENT)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Ordini (
        ID INTEGER NOT NULL UNIQUE,
        EmailUtente TEXT NOT NULL,
        Indirizzo TEXT NOT NULL,
        NumeroDiTelefono TEXT NOT NULL,
        Data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Totale REAL NOT NULL,
        PRIMARY KEY(ID AUTOINCREMENT),
        FOREIGN KEY(EmailUtente) REFERENCES Utenti(Email),
        FOREIGN KEY(Indirizzo) REFERENCES Utenti(Indirizzo),
        FOREIGN KEY(NumeroDiTelefono) REFERENCES Utenti(NumeroDiTelefono)
    )`);

    // Hash della password dell'amministratore
    bcrypt.hash('admin', saltRounds, (err, hash) => {
        if (err) {
            console.error('Errore nell\'hashing della password admin:', err.message);
            return;
        }

        // Inserimento utenti di esempio
        db.run(`INSERT OR IGNORE INTO Utenti (Email, Password, Nome, Cognome, Indirizzo, NumeroDiTelefono, AccessoSpeciale) VALUES
            ('admin@example.com', ?, 'Admin', 'User', 'Via Roma 1', '1234567890', 1),
            ('user@example.com', '$2b$10$KIX/8Q1J1Q1J1Q1J1Q1J1u1J1Q1J1Q1J1Q1J1Q1J1', 'User', 'Example', 'Via Milano 2', '0987654321', 0)
        `, [hash]);
    });

    // Inserimento prodotti di esempio
    db.run(`INSERT OR IGNORE INTO Prodotti (Nome, Prezzo, Quantita, Categoria, Immagine, Descrizione) VALUES
        ('La roche posay', 20.0, 100, 'Skincare', 'la-roche-posay.jpg', 'Descrizione del prodotto La roche posay'),
        ('La roche posay effaclar', 20.0, 50, 'Skincare', 'la-roche-posay-effaclar.jpg', 'Descrizione del prodotto La roche posay effaclar'),
        ('La roche posay effaclar gel', 20.0, 75, 'Skincare', 'la-roche-posay-effaclar-gel.jpg', 'Descrizione del prodotto La roche posay effaclar gel')
    `);

    // Inserimento ordini di esempio
    db.run(`INSERT OR IGNORE INTO Ordini (EmailUtente, Indirizzo, NumeroDiTelefono, Totale) VALUES
        ('user@example.com', 'Via Milano 2', '0987654321', 30.0)
    `);
});

// Route per la pagina principale
app.get('/', (req, res) => {
    db.all('SELECT * FROM Prodotti WHERE Disponibile = 1', (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti');
        }
        res.render('index', { products: rows, user: req.session.user });
    });
});

// Route per la pagina del catalogo prodotti
app.get('/prodotti', (req, res) => {
    db.all('SELECT * FROM Prodotti WHERE Disponibile = 1', (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti');
        }
        res.render('catalogo', { products: rows, user: req.session.user });
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
        res.render('prodotto', { product: row, user: req.session.user });
    });
});

// Route per la registrazione
app.get('/registrazione', (req, res) => {
    res.render('registrazione', { user: req.session.user });
});

app.post('/registrazione', (req, res) => {
    const { nome, cognome, indirizzo, numero_di_telefono, email, password } = req.body;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            console.error('Errore nell\'hashing della password:', err.message);
            return res.status(500).send('Errore nella registrazione');
        }
        db.run('INSERT INTO Utenti (Nome, Cognome, Indirizzo, NumeroDiTelefono, Email, Password) VALUES (?, ?, ?, ?, ?, ?)', [nome, cognome, indirizzo, numero_di_telefono, email, hash], function(err) {
            if (err) {
                console.error('Errore nella registrazione:', err.message);
                return res.status(500).send('Errore nella registrazione');
            }
            res.redirect('/');
        });
    });
});

// Route per l'accesso normale
app.get('/accesso', (req, res) => {
    res.render('accesso', { user: req.session.user });
});

app.post('/accesso', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('accesso', { 
            user: null, 
            errorMessage: 'Per favore, compila tutti i campi.' 
        });
    }

    db.get('SELECT * FROM Utenti WHERE Email = ?', [email], (err, row) => {
        if (err) {
            return res.status(500).send('Errore nell\'accesso');
        }

        if (!row) {
            return res.render('accesso', { 
                user: null, 
                errorMessage: 'Non risulti essere dei nostri, registrati!' 
            });
        }

        // Confronta la password fornita con quella memorizzata nel database
        bcrypt.compare(password, row.Password, (err, result) => {
            if (err) {
                return res.status(500).send('Errore nel confronto delle password');
            }

            if (result) {
                // Login riuscito
                req.session.user = row;
                return res.redirect('/');
            } else {
                // Password errata
                return res.render('accesso', { 
                    user: null, 
                    errorMessage: 'Password errata.' 
                });
            }
        });
    });
});

// Route per l'accesso riservato
app.get('/accesso_riservato', (req, res) => {
    res.render('accesso_riservato', { user: req.session.user });
});

app.post('/accesso_riservato', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('accesso_riservato', { 
            user: null, 
            errorMessage: 'Per favore, compila tutti i campi.' 
        });
    }

    db.get('SELECT * FROM Utenti WHERE Email = ? AND AccessoSpeciale = 1', [email], (err, row) => {
        if (err) {
            return res.status(500).send('Errore nell\'accesso riservato');
        }

        if (!row) {
            return res.render('accesso_riservato', { 
                user: null, 
                errorMessage: 'Non hai i permessi per accedere a questa area.' 
            });
        }

        // Confronta la password fornita con quella memorizzata nel database
        bcrypt.compare(password, row.Password, (err, result) => {
            if (err) {
                return res.status(500).send('Errore nel confronto delle password');
            }

            if (result) {
                // Accesso riservato riuscito
                req.session.user = row;
                return res.redirect('/area_riservata');
            } else {
                // Password errata
                return res.render('accesso_riservato', { 
                    user: null, 
                    errorMessage: 'Password errata.' 
                });
            }
        });
    });
});

// Middleware per verificare se l'utente è l'amministratore
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.Email === 'admin@example.com') {
        return next();
    }
    res.redirect('/accesso_riservato');
}

// Route per la pagina area riservata
app.get('/area_riservata', isAdmin, (req, res) => {
    db.all('SELECT * FROM Prodotti', (err, rows) => {
        if (err) {
            console.error('Errore nel recupero dei prodotti:', err.message);
            return res.status(500).send('Errore nel recupero dei prodotti');
        }
        res.render('area_riservata', { user: req.session.user, products: rows });
    });
});

app.post('/modifica_prodotto', upload.single('immagine'), (req, res) => {
    const { id, nome, prezzo, quantita, categoria } = req.body;
    const immagine = req.file ? `${req.file.filename}` : null; // Percorso relativo

    const query = immagine
        ? 'UPDATE Prodotti SET Nome = ?, Prezzo = ?, Quantita = ?, Categoria = ?, Immagine = ? WHERE ID = ?'
        : 'UPDATE Prodotti SET Nome = ?, Prezzo = ?, Quantita = ?, Categoria = ? WHERE ID = ?';

    const params = immagine
        ? [nome, prezzo, quantita, categoria, immagine, id]
        : [nome, prezzo, quantita, categoria, id];

    db.run(query, params, (err) => {
        if (err) {
            console.error('Errore nella modifica del prodotto:', err.message);
            return res.status(500).send('Errore nella modifica del prodotto');
        }
        res.redirect('/area_riservata');
    });
});

// Route per il logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Middleware per verificare se l'utente è loggato
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/accesso');
}

// Route per la pagina del mio account
app.get('/mio_account', isAuthenticated, (req, res) => {
    res.render('mio_account', { user: req.session.user });
});

// Route per la ricerca dei prodotti
app.get('/ricerca', (req, res) => {
    const query = req.query.q;
    db.all('SELECT * FROM Prodotti WHERE Nome LIKE ? AND Disponibile = 1', [`%${query}%`], (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti');
        }
        res.render('ricerca', { products: rows, user: req.session.user, query: query });
    });
});

// Route per le altre pagine
app.get('/skincare', (req, res) => {
    res.render('skincare', { user: req.session.user });
});

app.get('/farmaci_generici', (req, res) => {
    res.render('farmaci_generici', { user: req.session.user });
});

app.get('/erboristeria', (req, res) => {
    res.render('erboristeria', { user: req.session.user });
});

app.get('/integratori', (req, res) => {
    res.render('integratori', { user: req.session.user });
});

app.get('/prodotti_esposizione', (req, res) => {
    res.render('prodotti_esposizione', { user: req.session.user });
});

app.listen(port, () => {
    console.log(`Server in ascolto su http://localhost:${port}`);
});