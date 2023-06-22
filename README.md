# Web Development college project -  Node.js Application
This project is a web application that allows users to purchase products from an online store. The application is developed using Node.js and the Express web framework. 

It utilizes cookies and sessions for user authentication. The product information is stored in a MongoDB database and retrieved for display on the website. Users can add products to their shopping cart and review them before placing an order, all managed through cookies. There are two types of users: admin and standard user. The admin has privileged access to add new products to the database.

In terms of security, the application employs measures to protect against unauthorized access. It temporarily blocks access from an IP address if it attempts to access non-existent server resources. Additionally, it limits the number of consecutive failed login attempts from the same username. If the limit is exceeded within a short period, access to the login page and other site resources is denied. The application also takes precautions against injections attacks by sanitizing inputs and implementing specific security measures for the MongoDB database.

## Technologies used
* Node.js (v18.16.0)
* Express.js (v4.x)
* MongoDB
  
## Features
* User authentication with cookies and sessions
* Product listing and display
* Shopping cart functionality
* User roles (ADMIN and USER)
* Secure login with protection against brute-force attacks
* Protection against injection attacks
* Quiz questionnaire with results display
  
## Setup
The following steps are required to set up the project:

```
$ npm init
$ npm install
$ npm install -g nodemon
$ npm install express --save
$ npm install ejs --save
$ npm install express-ejs-layouts --save
$ npm install body-parser --save
$ npm install cookie-parser --save
$ npm install express-session --save
$ nodemon app.js
```
