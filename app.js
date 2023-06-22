const express = require('express');
const session = require("express-session");
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser');
const app = express();
const port = 6789;

// directorul 'views' va conține fișierele .ejs (html + js executat la server)
app.set('view engine', 'ejs');

// suport pentru layout-uri - implicit fișierul care reprezintă template-ul site-ului este views / layout.ejs
app.use(expressLayouts);

// directorul 'public' va conține toate resursele accesibile direct de către client (e.g., fișiere css, javascript, imagini)
app.use(express.static('public'))

// corpul mesajului poate fi interpretat ca json; datele de la formular se găsesc în format json în req.body
app.use(bodyParser.json());

// utilizarea unui algoritm de deep parsing care suportă obiecte în obiecte
app.use(bodyParser.urlencoded({ extended: true }));

// pentru a facilita lucrul cu cookie-uri
app.use(cookieParser());

// utilizare middleware 'express-session'
app.use(session({
    secret: 'secret', //pentru criptarea cookie-urilor de sesiune
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 3600000 // 1 ora
    }
}));

// conectarea la server-ul MongoDB
const { MongoClient } = require("mongodb");
const uri = "mongodb://127.0.0.1:27017/";
const databaseName = 'cumparaturi';
const collectionName = 'produse';
const client = new MongoClient(uri, { useUnifiedTopology: true });


//Detectarea încercărilor de accesare ale unor resurse de la server inexistente și blocarea temporara a accesului la 
//toate resursele pentru IP-ul respectiv.

let blockedIPs = {};
const blockDurationSeconds = 10; 

const blockIPMiddleware = (req, res, next) => {
    const clientIP = req.ip; 
    const requestedResource = req.path; 
    
    console.log('IP client: ', req.ip);
    console.log('Resursa ceruta: ', req.path);

    console.log('Before: ', blockedIPs[clientIP]);
    console.log('CheckResourceExistence: ', checkResourceExistence(requestedResource))
    if (!checkResourceExistence(requestedResource)) {
        console.log('After: ', blockedIPs[clientIP]);
        blockedIPs[clientIP] = true;

      setTimeout(() => {
        delete blockedIPs[clientIP];
      }, blockDurationSeconds * 1000);
    }
  
    if (blockedIPs[clientIP]) {
      return res.status(403).send('Accesul este temporar blocat pentru toate resursele. Vă rugăm să încercați mai târziu.');
    }
  
    next();
  };

function checkResourceExistence(resource) {
    console.log('Resource:', resource);
    const allowedResources = [
        '/',
        '/chestionar',
        '/rezultat-chestionar', 
        '/admin', 
        '/autentificare', 
        '/vizualizare-cos', 
        '/public/css/stil.css', 
        '/js/script.js',
        '/verificare-autentificare',
        '/creare-bd',
        '/inserare-bd',
        '/adaugare-produs',
        '/favicon.ico',
        '/adaugare-cos'
        ];
    return allowedResources.includes(resource);
}


app.use(blockIPMiddleware);

// actualizare questionList cu datele stocate in intrebari.json 
const fs = require('fs');
let questionList = [];
fs.readFile('intrebari.json', (err, data) => {
    if(err) throw err;
    questionList = JSON.parse(data);
});

// setare date utilizatori sa fie vizibile in toate templaturile ejs
const setAuthenticatedUser = (req, res, next) => {
    if (req.session.user) {
        res.locals.authenticatedUser = req.session.user;
        res.locals.loginButtonVisible = false; 
    } else {
        res.locals.authenticatedUser = null;
        res.locals.loginButtonVisible = true; 
    }
    next();
};

app.use(setAuthenticatedUser);

// http://localhost:6789/
// GET
/*
Serverul răspunde cu o pagină de Bine ai venit! și cu 
lista de produse din baza de date.
*/
app.get('/', async (req, res) => {
    let currentUsername = null;
    if (req.cookies.username)
    {
        currentUsername = req.cookies.username;
    }

    try {
        const client = await MongoClient.connect(uri, { useUnifiedTopology: true });
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        const products = await collection.find().toArray();

        res.render('index', {
            currentUsername: currentUsername,
            products: products
        });

        client.close();
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// http://localhost:6789/autentificare
// GET
/*
Serverul răspunde cu o pagină de Autentificare prin 
inserarea autentificare.ejs în layout.ejs și 
returnarea rezultatului la client.
*/
app.get('/autentificare', (req, res) => {
    errorMessage = "";

    if (null != req.cookies.errorMessage) {
      errorMessage = req.cookies.errorMessage;
      res.clearCookie('errorMessage');
    }
    
    // Clear the session and remove the authenticatedUser
    req.session.destroy(() => {
      res.clearCookie('username'); // Clear the username cookie
      res.locals.authenticatedUser = null; // Remove the authenticatedUser from res.locals
      res.locals.loginButtonVisible = false; // Set loginButtonVisible to true
      res.render('autentificare', {
        errorMessage: errorMessage,
      });
    });
  });
  

// http://localhost:6789/verificare-autentificare
// POST
/*
Se cere această resursă la apăsarea butonului de 
submit a formularului din /autentificare.
La server se verifică dacă utilizatorul și parola sunt 
corecte, și se răspunde cu un redirect spre resursa /, 
dacă sunt corecte, sau spre resursa /autentificare, 
dacă nu sunt corecte.
*/
const users = require('./utilizatori.json');
const maxFailedAttempts = 3;
const blockDurationSecondsFailedAuth = 10;

app.post('/verificare-autentificare', async (req, res) =>{
    username = req.body.username;
    password = req.body.password;

    const authenticatedUser = users.find((user) =>
        user.username === username && user.password == password && user.access === "allow"
    );

    if(authenticatedUser){
        res.cookie("username", username);
        req.session.user = {
            firstName: authenticatedUser.firstName,
            lastName: authenticatedUser.lastName,
            username: authenticatedUser.username,
            email: authenticatedUser.email,
            phone: authenticatedUser.phone,
            role: authenticatedUser.role
        };
        res.redirect(302, "/");
    }
    else{
        const failedAttemptsUser = users.find(
            (user) => user.username === username && user.access === "allow"
          );
          
          if (failedAttemptsUser) {
            if (!failedAttemptsUser.failedAuthAttempts) {
              failedAttemptsUser.failedAuthAttempts = 1;
            } else {
              failedAttemptsUser.failedAuthAttempts++;
          
              if (failedAttemptsUser.failedAuthAttempts >= maxFailedAttempts) {
                failedAttemptsUser.access = "denied";
                failedAttemptsUser.blockedUntil = new Date(
                  Date.now() + blockDurationSecondsFailedAuth * 1000
                ).toISOString();
                delete failedAttemptsUser.failedAuthAttempts;
          
                fs.writeFileSync('./utilizatori.json', JSON.stringify(users, null, 2));
          
                await new Promise((resolve) =>
                  setTimeout(resolve, blockDurationSecondsFailedAuth * 1000)
                );
          
                failedAttemptsUser.access = "allow";
                delete failedAttemptsUser.blockedUntil;
          
                fs.writeFileSync('./utilizatori.json', JSON.stringify(users, null, 2));
              }
            }
          
            fs.writeFileSync('./utilizatori.json', JSON.stringify(users, null, 2));
          }
          
        
        
        if(users.find((user) =>
            user.username === username && user.password == password && user.access === "denied")){
                res.cookie("errorMessage", "Accesul la cont este blocat. Reveniti mai tarziu!");
        }
        else{
              res.cookie("errorMessage", "Autentificare eșuată!");
        }
        res.redirect(302, "autentificare");
    }
});

// http://localhost:6789/chestionar
// GET
/*
Serverul răspunde cu formularul HTML (chestionarul) 
prin inserarea chestionar.ejs în layout.ejs și 
returnarea rezultatului la client.
*/
app.get('/chestionar', (req, res) => {
    res.locals.loginButtonVisible = false;
    res.render('chestionar', 
        { 
            questions: questionList 
        }
    );
});

// http://localhost:6789/rezultat-chestionar
// POST
app.post('/rezultat-chestionar', (req, res) => {
    var response = req.body;
    var userCorrectAnswers = 0;
    console.log('Rezultat-chestionar:', req.body);

    for(var i = 0; i < questionList.length; i++){
        var currentResponse = response["question" + i];
        if(currentResponse == questionList[i].correct){
            userCorrectAnswers++;
        }
    }

    var redirectUrl = '/rezultat-chestionar?userCorrectAnswers=' + userCorrectAnswers;

    for(var i = 0; i < questionList.length; i++){
        redirectUrl += '&question' + i + '=' + encodeURIComponent(response["question" + i]);
        redirectUrl += '&correctAnswer' + i + '=' + encodeURIComponent(questionList[i].options[questionList[i].correct]);
    }

    res.redirect(redirectUrl);
});

// http://localhost:6789/rezultat-chestionar
// GET
/*
Se cere această resursă la apăsarea butonului de 
submit a formularului din /chestionar.
La server se calculează numărul de răspunsuri corecte 
și se returnează răspunsul.
*/
app.get('/rezultat-chestionar', (req, res) => {
    res.locals.loginButtonVisible = false;
    var totalQuestions = questionList.length;
    var userCorrectAnswers = req.query.userCorrectAnswers;
    var results = [];

    for(var i = 0; i < totalQuestions; i++){
        console.log(i);
        console.log(questionList[i].question);
     
        var userChoice = req.query["question" + i];
        var correctAnswer = req.query["correctAnswer" + i];
        var response = questionList[i].options[userChoice];
        results.push({ question: questionList[i].question, response, correctAnswer });
    }
    console.log(results);
    res.render('rezultat-chestionar', {
        totalQuestions: totalQuestions,
        userCorrectAnswers: userCorrectAnswers,
        results: results
    });
});


// http://localhost:6789/creare-bd
// GET
/*
Serverul se conectează la serverul de baze de date și, 
într-o bază de date cu numele cumparaturi, creează 
o tabelă produse, după care răspunde clientului cu un 
redirect spre resursa /.
*/
app.get('/creare-bd', async (req, res) => {
    try {
        await client.connect();
        console.log('Conectarea la baza de date s-a facut cu succes!');
    
        const database = client.db(databaseName);
        try {
            await database.createCollection(collectionName);
            console.log('Colecția "produse" a fost creată!');
        } catch (e) {
            console.log('Colectia "produse" deja exista!');
        }
        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
  });  


// http://localhost:6789/inserare-bd
// GET
/*
Serverul se conectează la serverul de baze de date și 
inserează mai multe produse în tabela produse, după 
care răspunde clientului cu un redirect spre resursa /.
*/
app.get('/inserare-bd', async (req, res) => {
    try {
      await client.connect();
      console.log('Conectarea la baza de date s-a făcut cu succes!');
  
      const database = client.db(databaseName);
      const collection = database.collection(collectionName);
  
      const products = [
        { id: 1, name: 'Mere', price: 12.5, description: 'Fructe proaspete și delicioase' },
        { id: 2, name: 'Portocale', price: 23.0, description: 'Suculente și bogate în vitamina C' },
        { id: 3, name: 'Banană', price: 7.0, description: 'Sănătoase și pline de energie' },
        { id: 4, name: 'Kiwi', price: 13.5, description: 'Bogate în vitamina C și fibre' },
        { id: 5, name: 'Ananas', price: 30.0, description: 'Dulce și suculent, cu o aromă tropicală' },
        { id: 6, name: 'Capșuni', price: 35.0, description: 'Dulci și parfumate, perfecte pentru deserturi' },
        { id: 7, name: 'Pepene galben', price: 50.5, description: 'Suculent și răcoritor în zilele calde de vară' },
      ];
  
      for (const product of products) {
        const existingProduct = await collection.findOne({ id: product.id });
        if (!existingProduct) {
          await collection.insertOne(product);
        }
      }
  
      res.redirect('/');
    } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
    }
  });
  

// http://localhost:6789/adaugare-cos
// GET
/*
Serverul adaugă id-ul produsului specificat în corpul 
mesajului HTTP într-un vector din variabila de sesiune.
*/
app.get('/adaugare-cos', (req, res) => {
    //console.log(req.query);
    const productId = req.query.id;
    if(!req.session.cart){
        req.session.cart = [];
    }
    req.session.cart.push(productId);
    res.redirect('/');
});

// http://localhost:6789/vizualizare-cos
// GET
/*
Serverul răspunde cu o pagină de Vizualizare coș prin 
inserarea vizualizare-cos.ejs în layout.ejs și 
returnarea rezultatului la client.
*/
app.get('/vizualizare-cos', async (req, res) => {
    res.locals.loginButtonVisible = false;
    try{
        var cart = [];
        if(req.session.cart){
            cart = req.session.cart;
        }
        const cartNumeric = cart.map((item) => parseInt(item));

        await client.connect();
        console.log('Conectarea la baza de date s-a facut cu succes!');
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        const products = await collection.find().toArray();
        
        const productsCart = cartNumeric.flatMap((itemId) => {
            return products.filter((product) => product.id === itemId);
        });
        res.render('vizualizare-cos',
            {
                cart: cart, 
                productsCart: productsCart
            }
        );
    } catch (error){
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// http://localhost:6789/admin
// GET
/*
Serverul răspunde cu o pagină la care are acces doar adminul
pentru a putea adăuga un nou produs în baza de date.
*/
app.get('/admin', (req, res) => {
    adminMessage = "";

    if(null != req.cookies.adminMessage){
        adminMessage = req.cookies.adminMessage;
        res.clearCookie('adminMessage');
    }

        res.render('admin', {
            adminMessage: adminMessage,
        });
    
});

// http://localhost:6789/admin
// POST
/*
Se cere această resursă la apăsarea butonului de 
submit a formularului din /adaugare-produs.
La server se verifică dacă datele pentru adăugarea unui noi produs
sunt corecte, se adaugă în baza de date și se răspunde cu un redirect 
spre resursa /admin.
*/
function sanitizeString(input) {
    const pattern = /^[a-zA-Z0-9\s]+$/; 
    if (!pattern.test(input)) {
        throw new Error('Invalid input. Special characters are not allowed.');
    }

    return input.trim();
}

function sanitizeFloat(input) {
    return parseFloat(input);
}

app.post('/adaugare-produs', async (req, res) =>{
    console.log('adaugare produs', req.body);
    try {
        await client.connect();
        console.log('Conectarea la baza de date s-a facut cu succes!');

        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        
        const { name, price, description } = req.body;

        // Validate input
        if (!name || !price || !description) {
            throw new Error('Invalid input. All fields are required.');
        }

        // Sanitize input
        const sanitizedName = sanitizeString(name);
        const sanitizedPrice = sanitizeFloat(price);
        const sanitizedDescription = sanitizeString(description);
        
        const lastProduct = await collection.find().sort({ _id: -1 }).limit(1).toArray();
        const lastId = lastProduct.length > 0 ? lastProduct[0].id : 0;
    
        const newProduct = {
            id: lastId + 1,
            name: sanitizedName,
            price: sanitizedPrice,
            description: sanitizedDescription
        };

        await collection.insertOne(newProduct);
        res.cookie("adminMessage", "Adăugarea s-a făcut cu succes!");
        res.redirect(302, "admin");
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:`));