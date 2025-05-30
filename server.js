const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const favicon = require('serve-favicon');
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
        const nomeProdotto = req.body.nome.replace(/\s+/g, '_').toLowerCase(); // Rimuove spazi e converte in minuscolo
        const ext = path.extname(file.originalname); // Estensione del file
        const index = req.fileIndex || 0; // Indice per immagini multiple
        req.fileIndex = (req.fileIndex || 0) + 1; // Incrementa l'indice
        const fileName = index === 0 ? `${nomeProdotto}${ext}` : `${nomeProdotto}_${index}${ext}`;
        cb(null, fileName);
    }
});

const upload = multer({
    storage: storage,
    limits: { files: 10 }, // Limite massimo di 10 immagini
});

// Configura il motore di template EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve i file statici dalla cartella 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // middleware per analizzare il corpo delle richieste JSON
app.use(express.json());

// Serve the favicon
app.use(favicon(path.join(__dirname, 'public', 'images', 'favicon', 'favicon.ico')));

// Configura il middleware per le sessioni
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// Middleware per generare un SessionID univoco per utenti non registrati
app.use((req, res, next) => {
    if (!req.session.sessionID) {
        req.session.sessionID = `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    next();
});

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
        ID_Ordine INTEGER NOT NULL UNIQUE,
        EmailUtente TEXT NOT NULL,
        Indirizzo TEXT NOT NULL,
        NumeroDiTelefono TEXT NOT NULL,
        Data TIMESTAMP DEFAULT (DATETIME('now', 'localtime')),
        Totale REAL NOT NULL,
        PRIMARY KEY(ID_Ordine AUTOINCREMENT),
        FOREIGN KEY(EmailUtente) REFERENCES Utenti(Email)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Dettagli_Ordine (
        ID INTEGER NOT NULL UNIQUE,
        ID_Ordine INTEGER NOT NULL,
        ID_Prodotto INTEGER NOT NULL,
        Quantita INTEGER NOT NULL,
        PRIMARY KEY(ID AUTOINCREMENT),
        FOREIGN KEY(ID_Ordine) REFERENCES Ordini(ID_Ordine),
        FOREIGN KEY(ID_Prodotto) REFERENCES Prodotti(ID)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Carrello (
        EmailUtente TEXT,
        SessionID TEXT NOT NULL,
        ID_Prodotto INTEGER NOT NULL,
        Quantita INTEGER NOT NULL,
        PRIMARY KEY(EmailUtente, ID_Prodotto),
        FOREIGN KEY(EmailUtente) REFERENCES Utenti(Email),
        FOREIGN KEY(ID_Prodotto) REFERENCES Prodotti(ID)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Wishlist (
        EmailUtente TEXT,
        SessionID TEXT NOT NULL,
        ID_Prodotto INTEGER NOT NULL,
        Quantita INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(EmailUtente, ID_Prodotto),
        FOREIGN KEY(EmailUtente) REFERENCES Utenti(Email),
        FOREIGN KEY(ID_Prodotto) REFERENCES Prodotti(ID)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS CartePagamento (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        EmailUtente TEXT NOT NULL,
        Intestatario TEXT NOT NULL,
        NumeroCarta TEXT NOT NULL,
        Scadenza TEXT NOT NULL,
        CVV TEXT NOT NULL,
        FOREIGN KEY(EmailUtente) REFERENCES Utenti(Email)
    )`);


    // Hash della password dell'amministratore e dell'utente
    bcrypt.hash('admin', saltRounds, (err, adminHash) => {
        if (err) {
            console.error('Errore nell\'hashing della password admin:', err.message);
            return;
        }

    bcrypt.hash('1234', saltRounds, (err, userHash) => {
            if (err) {
                console.error('Errore nell\'hashing della password user:', err.message);
                return;
            }

        bcrypt.hash('password_gabriele', saltRounds, (err, gabrieleHash) => {
            if (err) {
                console.error('Errore nell\'hashing della password gabriele:', err.message);
                return;
            }

            // Inserimento utenti di esempio
            db.run(`INSERT OR IGNORE INTO Utenti (Email, Password, Nome, Cognome, Indirizzo, NumeroDiTelefono, AccessoSpeciale) VALUES
                ('admin@example.com', ?, 'Admin', 'User', 'Via Roma 1', '1234567890', 1),
                ('user@example.com', ?, 'User', 'Example', 'Via Milano 2', '0987654321', 0),
                ('gabriele@gmail.com', ?, 'Gabriele', 'Rossi', 'Via Prova 3', '1122334455', 0)
            `, [adminHash, userHash, gabrieleHash]);
        });
    });
});

});

// Route per la pagina principale
app.get('/', (req, res) => {
    const queryTopSold = `
        SELECT P.*, SUM(DO.Quantita) AS VenditeTotali
        FROM Prodotti P
        JOIN Dettagli_Ordine DO ON P.ID = DO.ID_Prodotto
        GROUP BY P.ID
        ORDER BY VenditeTotali DESC
        LIMIT 6
    `;

    const queryFillGaps = `
        SELECT *
        FROM Prodotti
        WHERE ID NOT IN (
            SELECT P.ID
            FROM Prodotti P
            JOIN Dettagli_Ordine DO ON P.ID = DO.ID_Prodotto
            GROUP BY P.ID
            ORDER BY SUM(DO.Quantita) DESC
            LIMIT 6
        )
        ORDER BY ID ASC
        LIMIT ?
    `;

    db.all(queryTopSold, [], (err, topSoldProducts) => {
        if (err) {
            console.error('Errore nel recupero dei prodotti più venduti:', err.message);
            return res.status(500).send('Errore interno del server.');
        }

        const remainingSlots = 6 - topSoldProducts.length;

        if (remainingSlots > 0) {
            db.all(queryFillGaps, [remainingSlots], (err, fillProducts) => {
                if (err) {
                    console.error('Errore nel recupero dei prodotti per riempire i buchi:', err.message);
                    return res.status(500).send('Errore interno del server.');
                }

                const products = [...topSoldProducts, ...fillProducts];
                res.render('index', { products, user: req.session.user });
            });
        } else {
            res.render('index', { products: topSoldProducts, user: req.session.user });
        }
    });
});

// Route per la pagina del catalogo prodotti
app.get('/catalogo', (req, res) => {
    db.all('SELECT * FROM Prodotti WHERE Disponibile = 1', (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti');
        }
        res.render('catalogo', { products: rows, user: req.session.user });
    });
});

// Route per la pagina del carrello
app.get('/carrello', (req, res) => {
    const emailUtente = req.session.user ? req.session.user.Email : null;
    const sessionID = req.session.sessionID;

    const query = emailUtente
        ? `SELECT P.Nome, P.Prezzo, P.Immagine, C.Quantita, C.ID_Prodotto 
           FROM Carrello C 
           JOIN Prodotti P ON C.ID_Prodotto = P.ID 
           WHERE C.EmailUtente = ?`
        : `SELECT P.Nome, P.Prezzo, P.Immagine, C.Quantita, C.ID_Prodotto 
           FROM Carrello C 
           JOIN Prodotti P ON C.ID_Prodotto = P.ID 
           WHERE C.SessionID = ?`;

    const params = emailUtente ? [emailUtente] : [sessionID];

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Errore nel recupero del carrello:', err.message);
            return res.status(500).send('Errore interno del server.');
        }
        res.render('carrello', { cartItems: rows, user: req.session.user });
    });
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

        // Percorso della cartella immagini
        const productImagesPath = path.join(__dirname, 'public/images/prodotti');
        const baseImageName = row.Immagine.replace('.jpg', ''); // Rimuove l'estensione .jpg
        const imageFiles = [];

        // Cerca tutte le immagini che seguono il formato <nome-immagine>-<numero>.jpg
        let index = 1;
        while (fs.existsSync(path.join(productImagesPath, `${baseImageName}-${index}.jpg`))) {
            imageFiles.push(`${baseImageName}-${index}.jpg`);
            index++;
        }

        // Aggiungi l'immagine principale come prima immagine
        imageFiles.unshift(row.Immagine);

        // Passa il numero di immagini e i dettagli del prodotto alla vista
        row.ImageCount = imageFiles.length;
        row.ImageFiles = imageFiles;

        res.render('prodotto', { product: row, user: req.session.user, sessionID: req.session.sessionID });
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

        if (row.AccessoSpeciale) {
            return res.render('accesso', {
                user: null,
                errorMessage: 'L\'utente admin può accedere solo tramite l\'accesso riservato.'
            });
        }

        // Confronta la password fornita con quella memorizzata nel database
        bcrypt.compare(password, row.Password, async (err, result) => {
            if (err) {
                return res.status(500).send('Errore nel confronto delle password');
            }

            if (result) {
                // Login riuscito
                req.session.user = row;

                try {
                    const sessionID = req.session.sessionID;

                    // Recupera i prodotti dal carrello del guest
                    const guestCart = await new Promise((resolve, reject) => {
                        db.all(
                            `SELECT ID_Prodotto, Quantita FROM Carrello WHERE SessionID = ?`,
                            [sessionID],
                            (err, rows) => {
                                if (err) reject(err);
                                else resolve(rows);
                            }
                        );
                    });

                    // Per ogni prodotto nel carrello del guest, aggiorna o inserisci nel carrello dell'utente
                    for (const item of guestCart) {
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO Carrello (EmailUtente, SessionID, ID_Prodotto, Quantita)
                                 VALUES (?, '', ?, ?)
                                 ON CONFLICT(EmailUtente, ID_Prodotto)
                                 DO UPDATE SET Quantita = Quantita + excluded.Quantita`,
                                [row.Email, item.ID_Prodotto, item.Quantita],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                    }

                    // Rimuovi i prodotti dal carrello del guest
                    await new Promise((resolve, reject) => {
                        db.run(
                            `DELETE FROM Carrello WHERE SessionID = ?`,
                            [sessionID],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });

                    return res.redirect('/');
                } catch (err) {
                    console.error('Errore nella sincronizzazione del carrello:', err.message);
                    return res.status(500).send('Errore interno del server.');
                }
            } else {
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

        if (!row.AccessoSpeciale) {
            return res.render('accesso_riservato', {
                user: null,
                errorMessage: 'Solo l\'utente admin può accedere tramite l\'accesso riservato.'
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

// Middleware per verificare se l'utente è loggato e non è admin
function isAuthenticatedAndNotAdmin(req, res, next) {
    if (req.session.user && req.session.user.Email !== 'admin@example.com') {
        return next();
    }
    res.redirect('/accesso');
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
    const { id, nome, prezzo, quantita, categoria, nuovaCategoria } = req.body;
    const immagine = req.file ? `${req.file.filename}` : null;

    // Determina la categoria finale
    const categoriaFinale = categoria === 'Nuova categoria' ? nuovaCategoria : categoria;

    if (categoria === 'Nuova categoria' && !nuovaCategoria) {
        return res.status(400).send('Inserire il nome della nuova categoria.');
    }
    console.log('Prodotto modificato:', req.body);

    const query = immagine
        ? 'UPDATE Prodotti SET Nome = ?, Prezzo = ?, Quantita = ?, Categoria = ?, Immagine = ? WHERE ID = ?'
        : 'UPDATE Prodotti SET Nome = ?, Prezzo = ?, Quantita = ?, Categoria = ? WHERE ID = ?';

    const params = immagine
        ? [nome, prezzo, quantita, categoriaFinale, immagine, id]
        : [nome, prezzo, quantita, categoriaFinale, id];

    db.run(query, params, (err) => {
        if (err) {
            console.error('Errore nella modifica del prodotto:', err.message);
            return res.status(500).send('Errore nella modifica del prodotto');
        }
        res.redirect('/gestione_prodotti');
    });
});

// Route per eliminare un prodotto
app.post('/elimina_prodotto', isAdmin, (req, res) => {
    const productId = req.body.id;
    if (!productId) {
        return res.status(400).send('ID prodotto non valido.');
    }
    db.get('SELECT * FROM Prodotti WHERE ID = ?', [productId], (err, prodotto) => {
        if (err) {
            console.error('Errore durante il recupero del prodotto da eliminare:', err.message);
            return res.status(500).send('Errore durante l\'eliminazione del prodotto.');
        }
        db.run('DELETE FROM Prodotti WHERE ID = ?', [productId], function(err) {
            if (err) {
                console.error('Errore durante l\'eliminazione del prodotto:', err.message);
                return res.status(500).send('Errore durante l\'eliminazione del prodotto.');
            }
            if (prodotto) {
                console.log(`Prodotto eliminato: ID=${prodotto.ID}, Nome='${prodotto.Nome}'`);
            } else {
                console.log(`Prodotto eliminato: ID=${productId}`);
            }
            res.redirect('/gestione_prodotti');
        });
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
    const emailUtente = req.session.user.Email;

    db.all(
        `SELECT * FROM Ordini WHERE EmailUtente = ? ORDER BY Data DESC`,
        [emailUtente],
        (err, ordini) => {
            if (err) {
                console.error('Errore nel recupero degli ordini:', err.message);
                return res.status(500).send('Errore interno del server.');
            }

            db.all(
                `SELECT ID, Intestatario, NumeroCarta, Scadenza FROM CartePagamento WHERE EmailUtente = ?`,
                [emailUtente],
                (err, savedCards) => {
                    if (err) {
                        console.error('Errore nel recupero delle carte salvate:', err.message);
                        return res.status(500).send('Errore interno del server.');
                    }

                    res.render('mio_account', {
                        user: req.session.user,
                        ordini,
                        savedCards
                    });
                }
            );
        }
    );
});

// Route per la pagina di modifica account
app.get('/modifica_account', isAuthenticated, (req, res) => {
    res.render('modifica_account', { user: req.session.user });
});

app.post('/modifica_account', isAuthenticated, (req, res) => {
    const { nome, cognome, indirizzo, numero_di_telefono } = req.body;
    const email = req.session.user.Email;

    db.run(
        `UPDATE Utenti SET Nome = ?, Cognome = ?, Indirizzo = ?, NumeroDiTelefono = ? WHERE Email = ?`,
        [nome, cognome, indirizzo, numero_di_telefono, email],
        (err) => {
            if (err) {
                console.error('Errore durante la modifica dei dettagli utente:', err.message);
                return res.status(500).send('Errore interno del server.');
            }

            // Aggiorna i dati nella sessione
            req.session.user.Nome = nome;
            req.session.user.Cognome = cognome;
            req.session.user.Indirizzo = indirizzo;
            req.session.user.NumeroDiTelefono = numero_di_telefono;

            res.redirect('/mio_account');
        }
    );
});

// Route per la ricerca dei prodotti
app.get('/ricerca', (req, res) => {
    const query = req.query.query ? req.query.query.trim() : '';
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
    const selectedCategories = req.query.categories ? req.query.categories.split(',') : [];
    const sortOrder = req.query.sortOrder || 'relevance';

    try {
        // Costruisci la query SQL dinamica per i filtri
        let sql = `
            SELECT * FROM Prodotti 
            WHERE Nome LIKE ? 
            ${maxPrice ? 'AND Prezzo <= ?' : ''} 
            ${selectedCategories.length > 0 ? 'AND Categoria IN (' + selectedCategories.map(() => '?').join(',') + ')' : ''}
        `;

        // Aggiungi l'ordinamento
        switch (sortOrder) {
            case 'name_asc':
                sql += ' ORDER BY Nome ASC';
                break;
            case 'name_desc':
                sql += ' ORDER BY Nome DESC';
                break;
            case 'price_asc':
                sql += ' ORDER BY Prezzo ASC';
                break;
            case 'price_desc':
                sql += ' ORDER BY Prezzo DESC';
                break;
            default:
                sql += ' ORDER BY INSTR(Nome, ?) DESC'; // Rilevanza
                break;
        }

        const params = [`%${query}%`, ...(maxPrice ? [maxPrice] : []), ...selectedCategories];
        if (sortOrder === 'relevance') params.push(query);

        db.all(sql, params, (err, products) => {
            if (err) {
                console.error('Errore nel recupero dei prodotti:', err.message);
                return res.status(500).send('Errore del server');
            }

            // Recupera tutte le categorie
            db.all('SELECT DISTINCT Categoria AS Nome FROM Prodotti', (err, categories) => {
                if (err) {
                    console.error('Errore nel recupero delle categorie:', err.message);
                    return res.status(500).send('Errore del server');
                }

                // Passa i filtri selezionati al template
                res.render('ricerca', { 
                    query, 
                    products, 
                    categories, 
                    user: req.session.user, 
                    selectedCategories, 
                    maxPrice, 
                    sortOrder 
                });
            });
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Errore del server');
    }
});

// Route dinamica per le categorie
app.get('/categoria/:nome', (req, res) => {
    const categoria = req.params.nome;

    db.all('SELECT * FROM Prodotti WHERE Categoria = ? AND Disponibile = 1', [categoria], (err, rows) => {
        if (err) {
            console.error(`Errore nel recupero dei prodotti per la categoria ${categoria}:`, err.message);
            return res.status(500).send('Errore nel recupero dei prodotti');
        }

        res.render('categoria', { category: categoria, products: rows, user: req.session.user });
    });
});

app.post('/aggiungi_al_carrello', async (req, res) => {
    const { productId, quantity } = req.body;

    if (!productId || isNaN(Number(productId))) {
        return res.status(400).json({ success: false, message: 'ID prodotto non valido.' });
    }

    if (quantity < 1) {
        return res.json({ success: false, message: 'Impossibile inserire un articolo di quantità zero!' });
    }

    try {
        const row = await new Promise((resolve, reject) => {
            db.get('SELECT Quantita FROM Prodotti WHERE ID = ?', [Number(productId)], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!row) {
            return res.json({ success: false, message: 'Prodotto non trovato.' });
        }

        if (row.Quantita < quantity) {
            return res.json({ success: false, message: 'Quantità non disponibile in magazzino.' });
        }

        const emailUtente = req.session.user ? req.session.user.Email : `guest-${req.session.sessionID}`;

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO Carrello (EmailUtente, SessionID, ID_Prodotto, Quantita) 
                 VALUES (?, ?, ?, ?) 
                 ON CONFLICT(EmailUtente, ID_Prodotto) 
                 DO UPDATE SET Quantita = Quantita + excluded.Quantita`,
                [emailUtente, req.session.sessionID, Number(productId), quantity],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ success: true, message: 'Prodotto aggiunto al carrello!' });
    } catch (err) {
        console.error('Errore durante l\'aggiunta al carrello:', err);
        res.status(500).json({ success: false, message: 'Errore interno del server.' });
    }
});

// Funzione helper per aggiornare o rimuovere un prodotto dal carrello
function updateCart(emailUtente, sessionID, idProdotto, nuovaQuantita) {
    return new Promise((resolve, reject) => {
        if (nuovaQuantita > 0) {
            db.run(
                `UPDATE Carrello SET Quantita = ? WHERE (EmailUtente = ? OR SessionID = ?) AND ID_Prodotto = ?`,
                [nuovaQuantita, emailUtente, sessionID, idProdotto],
                (err) => {
                    if (err) reject(err);
                    else {
                        resolve();
                    }
                }
            );
        } else {
            db.run(
                `DELETE FROM Carrello WHERE (EmailUtente = ? OR SessionID = ?) AND ID_Prodotto = ?`,
                [emailUtente, sessionID, idProdotto],
                (err) => {
                    if (err) reject(err);
                    else {
                        resolve();
                    }
                }
            );
        }
    });
}

// Route per aggiornare la quantità di un prodotto nel carrello
app.post('/update_quantity', (req, res) => {
    const { id, quantity } = req.body;

    if (!id || isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({ success: false, message: 'ID o quantità non validi.' });
    }

    const emailUtente = req.session.user ? req.session.user.Email : null;
    const sessionID = req.session.sessionID;

    db.get(
        `SELECT P.Prezzo 
         FROM Carrello C 
         JOIN Prodotti P ON C.ID_Prodotto = P.ID 
         WHERE (C.EmailUtente = ? OR C.SessionID = ?) AND C.ID_Prodotto = ?`,
        [emailUtente, sessionID, id],
        (err, row) => {
            if (err) {
                console.error('Errore nel recupero del prodotto:', err.message);
                return res.status(500).json({ success: false, message: 'Errore interno del server.' });
            }

            if (!row) {
                return res.status(404).json({ success: false, message: 'Prodotto non trovato nel carrello.' });
            }

            updateCart(emailUtente, sessionID, id, quantity)
                .then(() => {
                    const newTotal = row.Prezzo * quantity;
                    res.json({ success: true, newTotal });
                })
                .catch((err) => {
                    console.error('Errore nell\'aggiornamento della quantità:', err.message);
                    res.status(500).json({ success: false, message: 'Errore interno del server.' });
                });
        }
    );
});

// Route per rimuovere un prodotto dal carrello
app.post('/remove_item', (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ success: false, message: 'ID non valido.' });
    }

    const emailUtente = req.session.user ? req.session.user.Email : null;
    const sessionID = req.session.sessionID;

    updateCart(emailUtente, sessionID, id, 0)
        .then(() => res.json({ success: true }))
        .catch((err) => {
            console.error('Errore nella rimozione del prodotto:', err.message);
            res.status(500).json({ success: false, message: 'Errore interno del server.' });
        });
});

// Route per aggiornare il carrello
app.post('/aggiorna_carrello', (req, res) => {
    const emailUtente = req.session.user ? req.session.user.Email : null;
    const sessionID = req.session.sessionID;

    if (req.body.rimuovi) {
        const idProdotto = req.body.rimuovi;
        updateCart(emailUtente, sessionID, idProdotto, 0)
            .then(() => res.redirect('/carrello'))
            .catch((err) => {
                console.error('Errore nella rimozione del prodotto:', err.message);
                res.status(500).send('Errore interno del server.');
            });
    } else if (req.body.quantita) {
        const quantitaAggiornate = req.body.quantita;
        const updatePromises = Object.keys(quantitaAggiornate).map((idProdotto) => {
            const nuovaQuantita = parseInt(quantitaAggiornate[idProdotto]);
            return updateCart(emailUtente, sessionID, idProdotto, nuovaQuantita);
        });

        Promise.all(updatePromises)
            .then(() => res.redirect('/carrello'))
            .catch((err) => {
                console.error('Errore durante l\'aggiornamento del carrello:', err.message);
                res.status(500).send('Errore interno del server.');
            });
    } else {
        res.redirect('/carrello');
    }
});

//Pagina di checkout
app.get('/checkout', (req, res) => {
    const emailUtente = req.session.user ? req.session.user.Email : null;
    const sessionID = req.session.sessionID;

    db.all(
        `SELECT C.ID_Prodotto, C.Quantita, P.Prezzo, P.Nome 
         FROM Carrello C 
         JOIN Prodotti P ON C.ID_Prodotto = P.ID 
         WHERE (C.EmailUtente = ? OR C.SessionID = ?)`,
        [emailUtente, sessionID],
        (err, cartItems) => {
            if (err) {
                console.error('Errore nel recupero del carrello:', err.message);
                return res.status(500).send('Errore interno del server.');
            }

            let totale = 0;
            cartItems.forEach(item => {
                totale += item.Prezzo * item.Quantita;
            });

            if (emailUtente) {
                db.get(
                    `SELECT Indirizzo, NumeroDiTelefono FROM Utenti WHERE Email = ?`,
                    [emailUtente],
                    (err, userInfo) => {
                        if (err) {
                            console.error('Errore nel recupero dei dati utente:', err.message);
                            return res.status(500).send('Errore interno del server.');
                        }

                        db.get(
                            `SELECT Intestatario, NumeroCarta, Scadenza, CVV FROM CartePagamento WHERE EmailUtente = ? ORDER BY ID DESC LIMIT 1`,
                            [emailUtente],
                            (err, savedCardDetails) => {
                                if (err) {
                                    console.error('Errore nel recupero dei dettagli della carta:', err.message);
                                    return res.status(500).send('Errore interno del server.');
                                }

                                res.render('checkout', {
                                    cartItems,
                                    total: totale,
                                    user: req.session.user,
                                    indirizzo: userInfo ? userInfo.Indirizzo : '',
                                    telefono: userInfo ? userInfo.NumeroDiTelefono : '',
                                    savedCardDetails
                                });
                            }
                        );
                    }
                );
            } else {
                res.render('checkout', {
                    cartItems,
                    total: totale,
                    user: req.session.user,
                    indirizzo: '',
                    telefono: '',
                    savedCardDetails: null
                });
            }
        }
    );
});

app.post('/checkout', (req, res) => {
    const emailUtente = req.session.user ? req.session.user.Email : null;
    const sessionID = req.session.sessionID;
    const { indirizzo, telefono, metodoPagamento, intestatario, numeroCarta, scadenza, cvv, salvaCarta } = req.body;

    if (metodoPagamento === 'carta') {
        // Validazione dei dati della carta
        const numeroCartaPulito = numeroCarta.replace(/\s+/g, '');
        const [mese, anno] = scadenza.split('/').map(Number);
        const dataCorrente = new Date();
        const annoCorrente = dataCorrente.getFullYear() % 100;
        const meseCorrente = dataCorrente.getMonth() + 1;

        if (numeroCartaPulito.length !== 16 || isNaN(numeroCartaPulito)) {
            return res.status(400).send('Numero di carta non valido.');
        }
        if (isNaN(mese) || isNaN(anno) || anno < annoCorrente || (anno === annoCorrente && mese < meseCorrente)) {
            return res.status(400).send('La carta è scaduta.');
        }
        if (cvv.length !== 3 || isNaN(cvv)) {
            return res.status(400).send('CVV non valido.');
        }

        // Salva i dettagli della carta se richiesto
        if (salvaCarta && emailUtente) {
            db.get(
                `SELECT ID FROM CartePagamento WHERE NumeroCarta = ? AND EmailUtente = ?`,
                [numeroCartaPulito, emailUtente],
                (err, existingCard) => {
                    if (err) {
                        console.error('Errore durante il controllo della carta:', err.message);
                        return res.status(500).send('Errore interno del server.');
                    }

                    if (!existingCard) {
                        // Inserisce la carta solo se non esiste già
                        db.run(
                            `INSERT INTO CartePagamento (EmailUtente, Intestatario, NumeroCarta, Scadenza, CVV)
                             VALUES (?, ?, ?, ?, ?)`,
                            [emailUtente, intestatario, numeroCartaPulito, scadenza, cvv],
                            (err) => {
                                if (err) {
                                    console.error('Errore durante il salvataggio della carta:', err.message);
                                }
                            }
                        );
                    }
                }
            );
        }
    } else if (!indirizzo || !telefono) {
        // Validazione per metodi di pagamento alternativi
        return res.status(400).send('Indirizzo e telefono sono obbligatori per completare l\'ordine.');
    }

    // Inserimento ordine indipendentemente dal metodo di pagamento
    db.all(
        `SELECT C.ID_Prodotto, C.Quantita, P.Prezzo 
         FROM Carrello C 
         JOIN Prodotti P ON C.ID_Prodotto = P.ID 
         WHERE (C.EmailUtente = ? OR C.SessionID = ?)`,
        [emailUtente, sessionID],
        (err, cartItems) => {
            if (err) {
                console.error('Errore nel recupero del carrello:', err.message);
                return res.status(500).send('Errore interno del server.');
            }

            if (cartItems.length === 0) {
                return res.redirect('/carrello');
            }

            let totale = 0;
            cartItems.forEach(item => {
                totale += item.Prezzo * item.Quantita;
            });

            db.run(
                `INSERT INTO Ordini (EmailUtente, Indirizzo, NumeroDiTelefono, Totale) 
                 VALUES (?, ?, ?, ?)`,
                [emailUtente, indirizzo, telefono, totale],
                function (err) {
                    if (err) {
                        console.error('Errore durante l\'inserimento dell\'ordine:', err.message);
                        return res.status(500).send('Errore interno del server.');
                    }

                    const orderId = this.lastID;

                    const dettagliPromises = cartItems.map(item => {
                        return new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO Dettagli_Ordine (ID_Ordine, ID_Prodotto, Quantita) 
                                 VALUES (?, ?, ?)`,
                                [orderId, item.ID_Prodotto, item.Quantita],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                    });

                    const magazzinoPromises = cartItems.map(item => {
                        return new Promise((resolve, reject) => {
                            db.get(
                                `SELECT Quantita FROM Prodotti WHERE ID = ?`,
                                [item.ID_Prodotto],
                                (err, row) => {
                                    if (err) {
                                        return reject(err);
                                    }

                                    if (row.Quantita < item.Quantita) {
                                        return reject(new Error(`Quantità insufficiente per il prodotto con ID ${item.ID_Prodotto}`));
                                    }

                                    db.run(
                                        `UPDATE Prodotti SET Quantita = Quantita - ? WHERE ID = ?`,
                                        [item.Quantita, item.ID_Prodotto],
                                        (err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        }
                                    );
                                }
                            );
                        });
                    });

                    Promise.all(dettagliPromises)
                        .then(() => {
                            // Log riepilogo ordine
                            console.log(`Ordine effettuato da utente: ${emailUtente}`);
                            console.log('Prodotti:');
                            cartItems.forEach(item => {
                                console.log(`- ID Prodotto: ${item.ID_Prodotto}, Quantità: ${item.Quantita}`);
                            });
                            console.log(`Totale ordine: €${totale.toFixed(2)}`);
                            console.log(`Numero ordine: ${orderId}`);
                            
                            db.run(
                                `DELETE FROM Carrello WHERE (EmailUtente = ? OR SessionID = ?)`,
                                [emailUtente, sessionID],
                                (err) => {
                                    if (err) {
                                        console.error('Errore nella pulizia del carrello:', err.message);
                                        return res.status(500).send('Errore interno del server.');
                                    }

                                    res.redirect(`/conferma_ordine?orderNumber=${orderId}`);
                                }
                            );
                        })
                        .catch((err) => {
                            console.error('Errore durante l\'inserimento dei dettagli ordine:', err.message);
                            res.status(500).send('Errore interno del server.');
                        });
                }
            );
        }
    );
});

// Route per la pagina di conferma ordine
app.get('/conferma_ordine', (req, res) => {
    const orderNumber = req.query.orderNumber || 'N/A'; 
    res.render('conferma_ordine', { orderNumber, user: req.session.user });
});

// Route per i dettagli di un ordine
app.get('/dettagli_ordine/:id', isAuthenticated, (req, res) => {
    const ordineId = req.params.id;

    db.all(
        `SELECT P.Nome, P.Prezzo, DO.Quantita, (P.Prezzo * DO.Quantita) AS Subtotale
         FROM Dettagli_Ordine DO
         JOIN Prodotti P ON DO.ID_Prodotto = P.ID
         WHERE DO.ID_Ordine = ?`,
        [ordineId],
        (err, prodotti) => {
            if (err) {
                console.error('Errore nel recupero dei dettagli ordine:', err.message);
                return res.status(500).send('Errore interno del server.');
            }

            if (prodotti.length === 0) {
                return res.status(404).send('Dettagli ordine non trovati.');
            }

            const totaleOrdine = prodotti.reduce((totale, prodotto) => totale + prodotto.Subtotale, 0);

            res.render('dettagli_ordine', { ordineId, prodotti, totaleOrdine, user: req.session.user });
        }
    );
});

// Route per la pagina dei contatti
app.get('/contatti', (req, res) => {
    res.render('contatti', { user: req.session.user });
});

// Route per la pagina delle spedizioni
app.get('/spedizione', (req, res) => {
    res.render('spedizione', { user: req.session.user });
});

// Route per visualizzare la wishlist
app.get('/wishlist', isAuthenticatedAndNotAdmin, (req, res) => {
    const emailUtente = req.session.user.Email;

    db.all(
        `SELECT P.ID, P.Nome, P.Prezzo, P.Immagine, W.Quantita 
         FROM Wishlist W 
         JOIN Prodotti P ON W.ID_Prodotto = P.ID 
         WHERE W.EmailUtente = ?`,
        [emailUtente],
        (err, rows) => {
            if (err) {
                console.error('Errore nel recupero della wishlist:', err.message);
                return res.status(500).send('Errore interno del server.');
            }
            res.render('wishlist', { wishlistItems: rows, user: req.session.user, Items: rows });
        }
    );
});

// Route per aggiungere un prodotto alla wishlist
app.post('/aggiungi_wishlist', isAuthenticatedAndNotAdmin, async (req, res) => {
    const { productId, quantity } = req.body;
    const emailUtente = req.session.user.Email;

    if (!productId || isNaN(quantity) || quantity < 1) { // Usa "quantity" qui
        return res.status(400).json({ success: false, message: 'ID o quantità non validi.' });
    }

    try {
        const row = await new Promise((resolve, reject) => {
            db.get('SELECT Quantita FROM Prodotti WHERE ID = ?', [productId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!row) {
            return res.json({ success: false, message: 'Prodotto non trovato.' });
        }

        if (row.Quantita < quantity) { 
            return res.json({ success: false, message: 'Quantità non disponibile in magazzino.' });
        }

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO Wishlist (EmailUtente, SessionID, ID_Prodotto, Quantita) 
                 VALUES (?, ?, ?, ?) 
                 ON CONFLICT(EmailUtente, ID_Prodotto) 
                 DO UPDATE SET Quantita = Quantita + excluded.Quantita`,
                [emailUtente, req.session.sessionID, productId, quantity], 
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ success: true, message: 'Prodotto aggiunto alla wishlist!' });
    } catch (err) {
        console.error('Errore durante l\'aggiunta alla wishlist:', err.message);
        res.status(500).json({ success: false, message: 'Errore interno del server.' });
    }
});

// Route per spostare un prodotto dalla wishlist al carrello
app.post('/sposta_al_carrello', (req, res) => {
    const { productId } = req.body;
    const emailUtente = req.session.user ? req.session.user.Email : null;
    const sessionID = req.session.sessionID;

    db.get(
        `SELECT Quantita FROM Wishlist WHERE EmailUtente = ? AND ID_Prodotto = ?`,
        [emailUtente, productId],
        (err, row) => {
            if (err || !row) {
                console.error('Errore nel recupero del prodotto dalla wishlist:', err?.message);
                return res.status(500).send('Errore interno del server.');
            }

            const quantita = row.Quantita;

            db.run(
                `INSERT INTO Carrello (EmailUtente, SessionID, ID_Prodotto, Quantita) 
                 VALUES (?, ?, ?, ?) 
                 ON CONFLICT(EmailUtente, ID_Prodotto) 
                 DO UPDATE SET Quantita = Quantita + excluded.Quantita`,
                [emailUtente, sessionID, productId, quantita],
                (err) => {
                    if (err) {
                        console.error('Errore nello spostamento al carrello:', err.message);
                        return res.status(500).send('Errore interno del server.');
                    }

                    db.run(
                        `DELETE FROM Wishlist WHERE EmailUtente = ? AND ID_Prodotto = ?`,
                        [emailUtente, productId],
                        (err) => {
                            if (err) {
                                console.error('Errore nella rimozione dalla wishlist:', err.message);
                                return res.status(500).send('Errore interno del server.');
                            }
                            res.redirect('/wishlist'); // Reindirizza alla pagina della wishlist
                        }
                    );
                }
            );
        }
    );
});

app.post('/modifica_quantita_wishlist', isAuthenticatedAndNotAdmin, (req, res) => {
    const { productId, quantita } = req.body;

    if (!productId || isNaN(quantita) || quantita < 1) {
        return res.status(400).json({ success: false, message: 'Quantità non valida.' });
    }

    db.run(
        `UPDATE Wishlist SET Quantita = ? WHERE EmailUtente = ? AND ID_Prodotto = ?`,
        [quantita, req.session.user.Email, productId],
        (err) => {
            if (err) {
                console.error('Errore durante la modifica della quantità:', err.message);
                return res.status(500).json({ success: false, message: 'Errore interno del server.' });
            }
            res.json({ success: true });
        }
    );
});

app.post('/rimuovi_da_wishlist', isAuthenticatedAndNotAdmin, (req, res) => {
    const { productId } = req.body;

    if (!productId) {
        return res.status(400).send('ID prodotto non valido.');
    }

    db.run(
        `DELETE FROM Wishlist WHERE EmailUtente = ? AND ID_Prodotto = ?`,
        [req.session.user.Email, productId],
        (err) => {
            if (err) {
                console.error('Errore durante la rimozione dalla wishlist:', err.message);
                return res.status(500).send('Errore interno del server.');
            }
            res.redirect('/wishlist');
        }
    );
});

// Route per la pagina gestione prodotti
app.get('/gestione_prodotti', isAdmin, (req, res) => {
    db.all('SELECT * FROM Prodotti', (err, rows) => {
        if (err) {
            console.error('Errore nel recupero dei prodotti:', err.message);
            return res.status(500).send('Errore nel recupero dei prodotti');
        }
        res.render('gestione_prodotti', { user: req.session.user, products: rows });
    });
});

// Route per la pagina di modifica prodotto
app.get('/modifica_prodotto/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.get('SELECT * FROM Prodotti WHERE ID = ?', [productId], (err, product) => {
        if (err) {
            console.error('Errore nel recupero del prodotto:', err.message);
            return res.status(500).send('Errore nel recupero del prodotto');
        }
        if (!product) {
            return res.status(404).send('Prodotto non trovato');
        }

        db.all('SELECT DISTINCT Categoria AS Nome FROM Prodotti', (err, categorie) => {
            if (err) {
                console.error('Errore nel recupero delle categorie:', err.message);
                return res.status(500).send('Errore nel recupero delle categorie.');
            }
            res.render('modifica_prodotto', { user: req.session.user, product, categorie });
        });
    });
});

// Route per la pagina gestione ordini
app.get('/gestione_ordini', isAdmin, (req, res) => {
    db.all('SELECT * FROM Ordini', (err, rows) => {
        if (err) {
            console.error('Errore nel recupero degli ordini:', err.message);
            return res.status(500).send('Errore nel recupero degli ordini');
        }
        res.render('gestione_ordini', { user: req.session.user, orders: rows });
    });
});

// Route per la pagina magazzino
app.get('/magazzino', isAdmin, (req, res) => {
    db.all('SELECT Nome, Quantita FROM Prodotti', (err, rows) => {
        if (err) {
            console.error('Errore nel recupero dei prodotti dal magazzino:', err.message);
            return res.status(500).send('Errore nel recupero dei prodotti dal magazzino');
        }
        res.render('magazzino', { user: req.session.user, products: rows });
    });
});

// Route per la pagina di aggiunta prodotto
app.get('/aggiungi_prodotto', isAdmin, (req, res) => {
    db.all('SELECT DISTINCT Categoria AS Nome FROM Prodotti', (err, categorie) => {
        if (err) {
            console.error('Errore nel recupero delle categorie:', err.message);
            return res.status(500).send('Errore nel recupero delle categorie.');
        }
        res.render('aggiungi_prodotto', { user: req.session.user, categorie });
    });
});

// Route per gestire l'aggiunta di un nuovo prodotto
app.post('/aggiungi_prodotto', isAdmin, upload.array('immagini', 10), (req, res) => {
    const { nome, prezzo, quantita, categoria, descrizione, nuovaCategoria } = req.body;
    const immagini = req.files; // Array di file caricati

    if (!nome || !prezzo || !quantita || !descrizione || immagini.length === 0) {
        return res.status(400).send('Tutti i campi sono obbligatori.');
    }

    const categoriaFinale = categoria === 'Nuova categoria' ? nuovaCategoria : categoria;

    if (categoria === 'Nuova categoria' && !nuovaCategoria) {
        return res.status(400).send('Inserire il nome della nuova categoria.');
    }

    // Salva solo la prima immagine nel database
    const immaginePrincipale = immagini[0].filename;

    // Rinomina le altre immagini con il formato nomeprodotto-1.jpg, nomeprodotto-2.jpg, ecc.
    immagini.slice(1).forEach((file, index) => {
        const nomeProdotto = nome.replace(/\s+/g, '_').toLowerCase(); // Rimuove spazi e converte in minuscolo
        const ext = path.extname(file.originalname); // Estensione del file
        const nuovoNome = `${nomeProdotto}-${index + 1}${ext}`;
        const vecchioPercorso = path.join(__dirname, 'public/images/prodotti', file.filename);
        const nuovoPercorso = path.join(__dirname, 'public/images/prodotti', nuovoNome);

        // Rinomina il file
        fs.renameSync(vecchioPercorso, nuovoPercorso);
    });

    // Inseriamo il prodotto nel database con solo la prima immagine
    db.run(
        `INSERT INTO Prodotti (Nome, Prezzo, Quantita, Categoria, Immagine, Descrizione) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, prezzo, quantita, categoriaFinale, immaginePrincipale, descrizione],
        function (err) {
            if (err) {
                console.error('Errore durante l\'aggiunta del prodotto:', err.message);
                return res.status(500).send('Errore durante l\'aggiunta del prodotto.');
            }

            // Log del prodotto appena aggiunto
            console.log('Nuovo prodotto aggiunto:');
            console.log({
                ID: this.lastID,
                Nome: nome,
                Prezzo: prezzo,
                Quantita: quantita,
                Categoria: categoriaFinale,
                Immagine: immaginePrincipale,
                Descrizione: descrizione
            });

            // Reindirizza alla pagina di gestione prodotti
            res.redirect('/gestione_prodotti');
        }
    );
});

// Route per la pagina "Lavora con noi"
app.get('/lavora-con-noi', (req, res) => {
    res.render('lavora_con_noi', { user: req.session.user });
});

// Route per gestire l'invio del modulo "Lavora con noi"
app.post('/lavora-con-noi', (req, res) => {
    const { nome, email, telefono, messaggio } = req.body;

    if (!nome || !email || !telefono || !messaggio) {
        return res.status(400).json({ success: false, message: 'Tutti i campi sono obbligatori.' });
    }

    const filePath = path.join(__dirname, 'candidature.json');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Errore durante la lettura del file candidature:', err.message);
            return res.status(500).json({ success: false, message: 'Errore durante il salvataggio della candidatura.' });
        }

        let candidature = [];
        try {
            candidature = JSON.parse(data || '[]');
        } catch (parseError) {
            console.error('Errore durante il parsing del file candidature:', parseError.message);
            return res.status(500).json({ success: false, message: 'Errore durante il salvataggio della candidatura.' });
        }

        candidature.push({ nome, email, telefono, messaggio });

        console.log('Nuova candidatura ricevuta!');

        fs.writeFile(filePath, JSON.stringify(candidature, null, 2), (err) => {
            if (err) {
                console.error('Errore durante il salvataggio della candidatura:', err.message);
                return res.status(500).json({ success: false, message: 'Errore durante il salvataggio della candidatura.' });
            }

            res.json({ success: true, message: 'Grazie per aver inviato la tua candidatura! Ti contatteremo a breve.' });
        });
    });
});

app.get('/gestione_candidature', isAdmin, (req, res) => {
    const filePath = path.join(__dirname, 'candidature.json');

    // Controlla se il file esiste
    if (!fs.existsSync(filePath)) {
        // Crea il file con un array vuoto
        fs.writeFileSync(filePath, JSON.stringify([], null, 2));
    }

    // Leggi il file JSON delle candidature
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Errore nel caricamento delle candidature:', err.message);
            return res.status(500).send('Errore nel caricamento delle candidature.');
        }

        const candidature = JSON.parse(data || '[]');
        res.render('gestione_candidature', { user: req.session.user, candidature });
    });
});

app.delete('/rimuovi_carta/:id', isAuthenticated, (req, res) => {
    const cardId = req.params.id;
    const emailUtente = req.session.user.Email;

    db.run(
        `DELETE FROM CartePagamento WHERE ID = ? AND EmailUtente = ?`,
        [cardId, emailUtente],
        function (err) {
            if (err) {
                console.error('Errore durante la rimozione della carta:', err.message);
                return res.status(500).send('Errore interno del server.');
            }

            if (this.changes > 0) {
                res.status(200).send('Carta rimossa con successo.');
            } else {
                res.status(404).send('Carta non trovata.');
            }
        }
    );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server in esecuzione su http://localhost:${PORT}`);
});