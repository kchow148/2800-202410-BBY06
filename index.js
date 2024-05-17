require('dotenv').config();
const express = require("express");
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require("bcrypt");
const saltRounds = 12;

const app = express();
const port = process.env.PORT || 3000;
const expireTime = 1 * 60 * 60 * 1000;

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_secret = process.env.MONGODB_SESSION_SECRET;
const mongodb_database = process.env.MONGODB_DATABASE;
const node_session_secret = process.env.NODE_SESSION_SECRET;
const Joi = require("joi");
const favicon = require('serve-favicon');
const path = require('path');

app.use(express.urlencoded({ extended: false }));
var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}`,
    crypto: {
        secret: mongodb_secret
    }
});
const { database } = require('./databaseConnection');
const { Console } = require('console');
const userCollection = database.db(mongodb_database).collection('users');
const expenseCollection = database.db(mongodb_database).collection('expenses');
const investmentCollection = database.db(mongodb_database).collection('investments');
app.set('view engine', 'ejs');
app.use(favicon(path.join(__dirname + '/public', 'images', 'logo.ico')));


app.use(session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true
}));

function isValidSession(req) {
    if (req.session.authenticated) {
        return true;
    }
    return false;
}

function sessionValidation(req, res, next) {
    if (isValidSession(req)) {
        next();
    }
    else {
        res.redirect('/login');
    }
}

app.get('/', (req, res) => {
    console.log(isValidSession(req) == true);
    console.log(true);
    if (req.session.authenticated) {
        res.render("index");
    } else {
        res.render("index");

    }
});

app.get('/createUser', (req, res) => {
    res.render("createUser", { html: '' });
});


app.post('/submitUser', async (req, res) => {
    var username = req.body.username;
    var loginID = req.body.loginID;
    var password = req.body.password;

    const existingUser = await userCollection.findOne({ loginID: loginID });
    if (existingUser) {
        var html = "LoginID already taken. Please choose a different one.";
        return res.render("createUser", { html: html });
    }

    const schema = Joi.object({
        loginID: Joi.string().alphanum().max(20).required(),
        password: Joi.string().max(20).required()
    });

    const validationResult = schema.validate({ loginID, password });
    if (validationResult.error) {
        console.log(validationResult.error);
        res.redirect("/createUser");
        return;
    }

    var hashedPassword = await bcrypt.hash(password, saltRounds);

    await userCollection.insertOne({ username: username, loginID: loginID, password: hashedPassword });
    console.log("Inserted user");

    // Set session variables for the new user
    req.session.authenticated = true;
    req.session.loginID = loginID;
    req.session.cookie.maxAge = expireTime;

    var html = "successfully created user";

    //res.render("home", { html: html });
    res.redirect('/home');
});

app.get('/login', (req, res) => {
    res.render("login");
});

app.post('/loggingin', async (req, res) => {
    var loginID = req.body.loginID;
    var password = req.body.password;

    const schema = Joi.string().max(20).required();
    const validationResult = schema.validate(loginID);
    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.redirect("/login");
        return;
    }

    const result = await userCollection.find({ loginID: loginID }).project({ loginID: 1, password: 1, _id: 1 }).toArray();

    console.log(result);
    if (result.length != 1) {
        console.log("user not found");
        res.redirect("/login");
        return;
    }
    if (await bcrypt.compare(password, result[0].password)) {
        console.log("correct password");
        req.session.authenticated = true;
        req.session.loginID = loginID;
        req.session.user_type = result[0].user_type;
        req.session.cookie.maxAge = expireTime;

        res.redirect("/home");
        return;
    }
    else {
        console.log("incorrect password");
        res.redirect("/login");
        return;
    }
});

app.get("/passwordReset", (req, res) => {
    res.render("passwordReset");
});

app.post("/confirmLoginID", async (req, res) => {
    var loginID = req.body.loginID;

    const schema = Joi.string().max(20).required();
    const validationResult = schema.validate(loginID);
    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.redirect("/passwordReset");
        return;
    }

    const result = await userCollection.find({ loginID: loginID }).project({ loginID: 1, password: 1, _id: 1 }).toArray();

    if (result.length != 1) {
        console.log("user not found");
        res.redirect("/passwordReset");
        return;
    }

    res.redirect("/passwordChange");
});

app.get("/passwordChange", (req, res) => {
    res.render("passwordChange");
});

app.post("/changingPassword", async (req, res) => {
    var username = req.body.username;
    var password = req.body.password;

    const schema = Joi.string().max(20).required();
    var hashedPassword = await bcrypt.hash(password, saltRounds);
    await userCollection.updateOne({ username: username }, { $set: { password: hashedPassword } });
    res.redirect("/login");
    return;
});

app.use('/home', sessionValidation);
app.get('/home', async (req, res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
    }
    loginID = req.session.loginID;
    const result = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).limit(6).toArray();
    if (result[0].categories === undefined) {
        res.render("home", { exist: false });
    }
    else {
        budgets = result[0].categories
        let i = 0;
        let expenses = [];
        for (i = 0; i < budgets.length; i++) {
            var findexpense = budgets[i].budgetname;
            var find = {};
            let total = 0;
            find[findexpense] = 1;
            var expense = await expenseCollection.find({ loginID: loginID }).project(find).toArray();
            if (expense[0][findexpense] === undefined) {
                expenses.push(total);
                console.log("total is now: " + total);
            }
            else {
                let m = 0;
                for (m = 0; m < expense[0][findexpense].length; m++) {
                    total += expense[0][findexpense][m].price;
                }
                expenses.push(total);
                console.log("total is now: " + total);
            }
            console.log(expenses);
        }
        res.render("home", { exist: true, budgets: budgets,expenses: expenses });
    }
});


app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
})

app.use('/setBudget', sessionValidation);
app.get('/setBudget', (req, res) => {
    res.render("setBudget");
})

app.post('/settingBudget', async (req, res) => {
    budgetname = req.body.name;
    budgetamount = req.body.amount;
    loginID = req.session.loginID;
    console.log(loginID)
    const schema = Joi.object(
        {
            budgetname: Joi.string().regex(/^[a-zA-Z0-9-]+$/).max(20).required(),
            budgetamount: Joi.number().required()
        });
    const validationResult = schema.validate({ budgetname, budgetamount });
    if (validationResult.error != null) {
        console.log(validationResult.error.details[0].path[0]);
        var error = validationResult.error.details[0].message;
        res.render('setBudgeterror', { error: error });
        return
    }
    const changed = await userCollection.updateOne(
        // Filter criteria to find the document to update
        { loginID: loginID },
        // Update operation
        { $addToSet: { categories: { $each: [{ budgetname: budgetname, budgetamount: Number(budgetamount) }] } } },
        // Options (optional)
    )
    if (changed.modifiedCount == 0) {
        console.log("budget already exists");
    }
    res.redirect('/setBudget');
});

app.use('/addExpenses', sessionValidation);
app.get('/addExpenses', async (req, res) => {
    loginID = req.session.loginID
    const result = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).toArray();

    if (result.length === 0 || result[0].categories === undefined) {
        res.render("addExpenses", { exist: false })
    }
    else {
        category = result[0].categories;
        res.render("addExpenses", { exist: true, category: category });
    }
});

app.post('/addingExpenses', async (req, res) => {
    expense = req.body.expense
    category = decodeURIComponent(req.body.category);
    console.log(category);
    price = req.body.price;
    loginID = req.session.loginID;
    //------------------------
    let total = 0;
    const result = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).limit(6).toArray();
    if (result[0].categories === undefined) {
        res.render("expenses", { exist: false });
    }
    else {
        var overspent = false;
        budgets = result[0].categories
        let i = 0;
        let expenses = [];
        for (i = 0; i < budgets.length; i++) {
            var findexpense = budgets[i].budgetname;
            var find = {};
            
            find[findexpense] = 1;
            var expense = await expenseCollection.find({ loginID: loginID }).project(find).toArray();
            if (expense[0][findexpense] === undefined) {
                expenses.push(total);
                console.log("total is now: " + total);
            }
            else {
                let m = 0;
                for (m = 0; m < expense[0][findexpense].length; m++) {
                    total += expense[0][findexpense][m].price;
                }
                expenses.push(total);
                console.log("total is now: " + total);

                // Check if total exceeds budget
                if (total > budgets[i].budgetamount) {
                    console.log("total: " + total + " budgets[i].budgetamount: " + budgets[i].budgetamount);
                    console.log(`Budget exceeded for category: ${findexpense}`);
                    overspent = true;
                }

            }
            console.log("expense: " + expenses);
        }
        // console.log("budgets: " + budgets);
        // console.log("budgets.budgetamount: " + budgets.budgetamount);
        if(overspent){
            return res.redirect('/budgetExceeded');
        }
    }
    //------------------------
    objexpense = { expense: expense, date: new Date().toISOString(), price: Number(price) };
    catexpense = {};
    catexpense[category] = objexpense;

    await expenseCollection.findOneAndUpdate(
        { loginID: loginID },
        { $push: catexpense },
        { upsert: true, new: true }
    );

    addexpense = { expense: expense, date: "date", price: Number(price), category: category };
    expense = {};
    expense["expense"] = addexpense;
    await expenseCollection.findOneAndUpdate(
        { loginID: loginID },
        { $push: expense },
        { upsert: true, new: true }
    );
    res.redirect('/addExpenses');
});

app.use('/profilePage', sessionValidation);
app.get('/profilePage', async (req, res) => {
    loginID = req.session.loginID;
    // const result = userCollection.find({loginID : loginID}).project({username:1, loginID: 1, email: 1}).toArray();
    const result = await userCollection.find({ loginID: loginID }).project({ username: 1, loginID: 1 }).toArray();
    console.log(result);
    username = result[0].username
    res.render("profilePage", { username: username, loginID: loginID });

});

//if the user goes over budget, direct to here:
app.get('/budgetExceeded', async (req, res) => {
    res.render("WarningExceedBudget");
});

app.use('/budgets', sessionValidation);
app.get('/budgets', async (req, res) => {
    loginID = req.session.loginID;
    const result = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).toArray();
    console.log(result);
    if (result[0].categories === undefined) {
        res.redirect("/home");
    }
    else {
        budgets = result[0].categories;
        res.render("budgets", { budgets: budgets });
    }
});

app.use('/expenses', sessionValidation);
app.get('/expenses', async (req, res) => {
    // loginID = req.session.loginID;
    // const result = await expenseCollection.find({ loginID: loginID }).project({ expense: 1 }).toArray();
    // //const result2 = await expenseCollection.find({ loginID: loginID }).project({ budgetAmount: 1 }).toArray();
    // const resultUser = await userCollection.find({ loginID: loginID }).project({ categories: 1 }).toArray();
    // const budgetsArray = resultUser[0].categories;
    // console.log("budgetsArray: " + budgetsArray);

    // for(let i = 0; i < resultUser[0].categories.length; i++){

    //     var nameOfCat = resultUser[0].categories[i].budgetname;
    //     console.log("name of cat: " + nameOfCat);

    //     var projection = {};
    //     projection[nameOfCat] = 1;

    //     var result2 = await expenseCollection.find({ loginID: loginID }).project(projection).toArray();
    //     console.log("result2: " + result2);
    //     if(result2){
    //         console.log("results2[0]: " + result2[0]);
    //         console.log("result2[0].price: " + result2[0].price);
    //     }
    // }
    
    // //logic: find the budget name then use it to select the expenses that have that budget category name, add up all the eppxenses with that name and compare it to the budgets category in the users collection

    // let total = calculateTotal(result);
    // // console.log("total price: " + total);
    // // console.log(result[0].expense.length);
    // // console.log(result[0].expense);

    // if (result.length === 0 || result[0].expense === undefined) {
    //     res.render("expenses", { exist: false });
    // }
    // else {
    //     expense = result[0].expense;
    //     res.render("expenses", { expense: expense, exist: true });

    //     if(result[0].expense){
    //         let total = calculateTotal(result);
    //         for (const budget of budgetsArray) {
    //             const budgetName = budget.budgetname;
    //             const budgetAmount = parseFloat(budget.budgetamount); 
          
    //             console.log(`Budget Name: ${budgetName}, Budget Amount: ${budgetAmount}`);
          
    //             if(total >= budgetAmount){
    //                 console.log("OVERSPENT" + total);
                    
    //             }
    //         }
    //     }
    // };
    loginID = req.session.loginID;
    const result = await expenseCollection.find({ loginID: loginID }).project({ expense: 1 }).toArray();
    if (result.length === 0 || result[0].expense === undefined) {
        res.render("expenses", { exist: false })
    }
    else {
        expense = result[0].expense;
        res.render("expenses", { expense: expense, exist: true })
    };
});

function calculateTotal(result){
    let total = 0;
    for(i = 0; i < result[0].expense.length; i++){
        //console.log("prices: " + result[0].expense[0].price);
        total += parseFloat(result[0].expense[i].price);
    }
    return total;
}

app.use('/investments', sessionValidation);
app.get('/investments', async (req, res) => {
    res.render("investments");
})

app.post('/addingInvestments', async (req, res) => {
    var investment = req.body.investment;
    var price = req.body.price;
    var year = req.body.year;
    var loginID = req.session.loginID;

    await investmentCollection.insertOne({ investment: investment, price: price, year: year, loginID: loginID });
    res.redirect("/calculations");
});

app.use('/calculations', sessionValidation);
app.get('/calculations', async (req, res) => {
    res.render("calculations");
})

app.get('*', (req, res) => {
    res.status(404);
    res.render("404");
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})