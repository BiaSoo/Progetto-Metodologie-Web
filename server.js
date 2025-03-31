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
app.use(bodyParser.json()); // middleware per analizzare il corpo delle richieste JSON

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
        Data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
        PRIMARY KEY(EmailUtente, SessionID, ID_Prodotto),
        FOREIGN KEY(EmailUtente) REFERENCES Utenti(Email),
        FOREIGN KEY(ID_Prodotto) REFERENCES Prodotti(ID)
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

            // Inserimento utenti di esempio
            db.run(`INSERT OR IGNORE INTO Utenti (Email, Password, Nome, Cognome, Indirizzo, NumeroDiTelefono, AccessoSpeciale) VALUES
                ('admin@example.com', ?, 'Admin', 'User', 'Via Roma 1', '1234567890', 1),
                ('user@example.com', ?, 'User', 'Example', 'Via Milano 2', '0987654321', 0)
            `, [adminHash, userHash]);
        });
    });

    // Inserimento prodotti di esempio
    db.run(`INSERT OR IGNORE INTO Prodotti (Nome, Prezzo, Quantita, Categoria, Immagine, Descrizione) VALUES
        ('La roche posay', 20.0, 100, 'Skincare', 'la-roche-posay.jpg', 'Descrizione del prodotto La roche posay'),
        ('La roche posay effaclar', 20.0, 50, 'Skincare', 'la-roche-posay-effaclar.jpg', 'Descrizione del prodotto La roche posay effaclar'),
        ('La roche posay effaclar gel', 20.0, 75, 'Skincare', 'la-roche-posay-effaclar-gel.jpg', 'Descrizione del prodotto La roche posay effaclar gel'),
        ('Acqua micellare CeraVe', 13.69, 100, 'Skincare', 'cerave-acqua-micellare.jpg', 'L’ Acqua Micellare Detergente CeraVe è un detergente viso delicato con formula senza risciacquo. Arricchita con tre ceramidi essenziali e niacinamide, questa acqua micellare rimuove le impurità, sebo in eccesso e make up, nel rispetto della barriera protettiva della pelle. Non comedogenica, senza profumo. Adatta a pelli sensibili.'),
        ('Crema viso CeraVe', 12.99, 100, 'Skincare', 'cerave-crema-viso.jpg', 'La Crema Viso Idratante CeraVe è una crema viso idratante per pelli secche e molto secche. Arricchita con tre ceramidi essenziali e acido ialuronico, questa crema viso idratante rafforza la barriera protettiva della pelle e idrata a fondo. Non comedogenica, senza profumo. Adatta a pelli sensibili.'),
        ('Crema mani Neutrogena', 3.99, 100, 'Skincare', 'neutrogena-crema-mani.jpg', 'La Crema Mani Concentrata Neutrogena è una crema mani idratante e protettiva per mani secche e screpolate. Arricchita con glicerina, questa crema mani idrata a fondo e protegge la pelle delle mani. Non unge, non lascia residui. Adatta a pelli secche e sensibili.'),
        ('Crema viso Neutrogena', 9.99, 100, 'Skincare', 'neutrogena-crema-viso.jpg', 'La Crema Viso Idratante Neutrogena è una crema viso idratante per pelli secche e sensibili. Arricchita con glicerina e vitamina E, questa crema viso idrata a fondo e protegge la pelle del viso. Non comedogenica, senza profumo. Adatta a pelli secche e sensibili.'),
        ('Crema mani Vichy', 4.99, 100, 'Skincare', 'vichy-crema-mani.jpg', 'La Crema Mani Idratante Vichy è una crema mani idratante e protettiva per mani secche e screpolate. Arricchita con glicerina e vitamina, questa crema mani idrata a fondo e protegge la pelle delle mani. Non unge, non lascia residui. Adatta a pelli secche e sensibili.'),
        ('Paracetamolo 500', 5.0, 100, 'Farmaci Generici', 'paracetamolo.jpg', "Come antipiretico: trattamento sintomatica di affezioni febbrili quali influenza, le malattie esantematiche, le affezioni acute del tratto respiratorio, ecc. Come analgesico: cefalee, nevralgie, mialgie ed al tre manifestazioni dolorose di media entita', di varia origine."),
        ('Tachipirina 500', 4.0, 100, 'Farmaci Generici', 'tachipirina.jpg', "Indicata per il TRATTAMENTO DELLA FEBBRE E DEL DOLORE di varia origine. Tachipirina contiene il principio attivo PARACETAMOLO che agisce riducendo la febbre (antipiretico) e alleviando il dolore (analgesico). Tachipirina è utilizzato negli adulti, adolescenti e bambini per: -     il trattamento sintomatico degli stati febbrili quali l’influenza, le malattie esantematiche (malattie infettive tipiche dei bambini e degli adolescenti), le malattie acute del tratto respiratorio, ecc. -     dolori di varia origine e natura (mal di testa, nevralgie, dolori muscolari ed altre manifestazioni dolorose di media entità). Si rivolga al medico se lei/il bambino non si sente meglio o se si sente peggio dopo 3 giorni di trattamento."),
        ('Moment 200', 3.0, 100, 'Farmaci Generici', 'moment.jpg', "Indicato per il trattamento sintomatico di mal di testa, mal di denti, dolori mestruali, dolori muscolari e dolori articolari di lieve intensità."),
        ('Ibuprofene 400', 6.0, 100, 'Farmaci Generici', 'ibuprofene.jpg', "IBUPROFENE DOC è utilizzato: • per trattare il dolore di varia natura, dovuto a mal di denti (ad esempio dopo estrazione o interventi ai denti e alla bocca), dolori mestruali, mal di testa, dolori ai muscoli, alle articolazioni (osteoarticolari) e ai nervi (nervralgie); • insieme ad altri farmaci, per trattare i sintomi dovuti all'influenza o agli stati febbrili."),
        ('Aspirina 100', 3.0, 100, 'Farmaci Generici', 'aspirina.jpg', 'Descrizione del prodotto Aspirina'),
        ('Echinacea', 10.0, 100, 'Erboristeria', 'echinacea.jpg', 'Descrizione del prodotto Echinacea'),
        ('Ginseng', 12.0, 100, 'Erboristeria', 'ginseng.jpg', 'Descrizione del prodotto Ginseng'),
        ('Valeriana', 8.0, 100, 'Erboristeria', 'valeriana.jpg', 'Descrizione del prodotto Valeriana'),
        ('Vitamina C', 15.0, 100, 'Integratori', 'vitamina-c.jpg', 'Descrizione del prodotto Vitamina C'),
        ('Vitamina D', 18.0, 100, 'Integratori', 'vitamina-d.jpg', 'Descrizione del prodotto Vitamina D'),
        ('Omega 3', 20.0, 100, 'Integratori', 'omega-3.jpg', 'Descrizione del prodotto Omega 3'),
        ('Termometro', 30.0, 100, 'Prodotti Esposizione', 'prodotti-espositivi.jpg', 'Descrizione del prodotto Prodotti espositivi '),
        ('Mascherine', 10.0, 100, 'Prodotti Esposizione', 'prodotti-espositivi.jpg', 'Descrizione del prodotto Prodotti espositivi '),
        ('Gel disinfettante', 5.0, 100, 'Prodotti Esposizione', 'prodotti-espositivi.jpg', 'Descrizione del prodotto Prodotti espositivi ')
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

    db.all(
        `SELECT P.Nome, P.Prezzo, P.Immagine, C.Quantita, C.ID_Prodotto 
         FROM Carrello C 
         JOIN Prodotti P ON C.ID_Prodotto = P.ID 
         WHERE (C.EmailUtente = ? OR C.SessionID = ?)`,
        [emailUtente, sessionID],
        (err, rows) => {
            if (err) {
                console.error('Errore nel recupero del carrello:', err.message);
                return res.status(500).send('Errore interno del server.');
            }
            res.render('carrello', { cartItems: rows, user: req.session.user });
        }
    );
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

        // Confronta la password fornita con quella memorizzata nel database
        bcrypt.compare(password, row.Password, (err, result) => {
            if (err) {
                return res.status(500).send('Errore nel confronto delle password');
            }

            if (result) {
                // Login riuscito
                req.session.user = row;

                // Aggiorna il carrello con i dati dell'utente
                db.run(
                    `UPDATE Carrello SET EmailUtente = ? WHERE SessionID = ?`,
                    [row.Email, req.session.sessionID],
                    (err) => {
                        if (err) {
                            console.error('Errore nella sincronizzazione del carrello:', err.message);
                        }
                    }
                );

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
    const immagine = req.file ? `${req.file.filename}` : null; 

    console.log('Dati ricevuti:', req.body);

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
    const emailUtente = req.session.user.Email;

    db.all(
        `SELECT * FROM Ordini WHERE EmailUtente = ? ORDER BY Data DESC`,
        [emailUtente],
        (err, ordini) => {
            if (err) {
                console.error('Errore nel recupero degli ordini:', err.message);
                return res.status(500).send('Errore interno del server.');
            }

            res.render('mio_account', { user: req.session.user, ordini });
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
    db.all('SELECT * FROM Prodotti WHERE Categoria = ? AND Disponibile = 1', ['Skincare'], (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti Skincare');
        }
        res.render('skincare', { products: rows, user: req.session.user });
    });
});

app.get('/farmaci_generici', (req, res) => {
    db.all('SELECT * FROM Prodotti WHERE Categoria = ? AND Disponibile = 1', ['Farmaci Generici'], (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti Farmaci Generici');
        }
        res.render('farmaci_generici', { products: rows, user: req.session.user });
    });
});

app.get('/erboristeria', (req, res) => {
    db.all('SELECT * FROM Prodotti WHERE Categoria = ? AND Disponibile = 1', ['Erboristeria'], (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti Erboristeria');
        }
        res.render('erboristeria', { products: rows, user: req.session.user });
    });
});

app.get('/integratori', (req, res) => {
    db.all('SELECT * FROM Prodotti WHERE Categoria = ? AND Disponibile = 1', ['Integratori'], (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti Integratori');
        }
        res.render('integratori', { products: rows, user: req.session.user });
    });
});

app.get('/prodotti_esposizione', (req, res) => {
    db.all('SELECT * FROM Prodotti WHERE Categoria = ? AND Disponibile = 1', ['Prodotti Esposizione'], (err, rows) => {
        if (err) {
            return res.status(500).send('Errore nel recupero dei prodotti Prodotti Esposizione');
        }
        res.render('prodotti_esposizione', { products: rows, user: req.session.user });
    });
});

app.post('/aggiungi_al_carrello', async (req, res) => {
    const { productId, quantity } = req.body;

    console.log('Dati ricevuti:', { productId, quantity }); // Log dettagliato dei dati ricevuti

    if (!productId || isNaN(Number(productId))) {
        console.error('ID prodotto non valido o undefined:', productId); // Log più dettagliato
        return res.status(400).json({ success: false, message: 'ID prodotto non valido.' });
    }

    if (quantity < 1) {
        return res.json({ success: false, message: 'Impossibile inserire un articolo di quantità zero!' });
    }

    try {
        const row = await new Promise((resolve, reject) => {
            db.get('SELECT Quantita FROM Prodotti WHERE ID = ?', [Number(productId)], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });

        if (!row) {
            return res.json({ success: false, message: 'Prodotto non trovato.' });
        }

        if (row.Quantita < quantity) {
            return res.json({ success: false, message: 'Quantità non disponibile in magazzino.' });
        }

        const emailUtente = req.session.user ? req.session.user.Email : null;
        const sessionID = req.session.sessionID;

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO Carrello (EmailUtente, SessionID, ID_Prodotto, Quantita) 
                 VALUES (?, ?, ?, ?) 
                 ON CONFLICT(EmailUtente, SessionID, ID_Prodotto) 
                 DO UPDATE SET Quantita = Quantita + ?`,
                [emailUtente, sessionID, Number(productId), quantity, quantity],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });

        await new Promise((resolve, reject) => {
            db.run('UPDATE Prodotti SET Quantita = Quantita - ? WHERE ID = ?', [quantity, Number(productId)], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
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
                        console.log(`Quantità aggiornata: Prodotto ID ${idProdotto}, Nuova Quantità: ${nuovaQuantita}`);
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
                        console.log(`Prodotto rimosso dal carrello: ID ${idProdotto}`);
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
                    console.log(`Totale aggiornato per il prodotto ID ${id}: €${newTotal.toFixed(2)}`);
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

                        res.render('checkout', {
                            cartItems,
                            total: totale,
                            user: req.session.user,
                            indirizzo: userInfo ? userInfo.Indirizzo : '',
                            telefono: userInfo ? userInfo.NumeroDiTelefono : ''
                        });
                    }
                );
            } else {
                res.render('checkout', {
                    cartItems,
                    total: totale,
                    user: req.session.user,
                    indirizzo: '',
                    telefono: ''
                });
            }
        }
    );
});

app.post('/checkout', (req, res) => {
    const emailUtente = req.session.user ? req.session.user.Email : null;
    const sessionID = req.session.sessionID;
    const { indirizzo, telefono, metodoPagamento } = req.body;

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

                    Promise.all(dettagliPromises)
                        .then(() => {
                            // Log riepilogo ordine
                            console.log(`Ordine effettuato da utente: ${emailUtente || 'Utente non registrato'}`);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server in esecuzione su http://localhost:${PORT}`);
});