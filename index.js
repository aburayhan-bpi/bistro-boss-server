const express = require('express')
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const port = process.env.PORT | 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

// mail gun
const formData = require('form-data')
const Mailgun = require('mailgun.js')
const mailgun = new Mailgun(formData)
const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY || 'key-yourkeyhere' });


// middleware
app.use(express.json())
app.use(cors())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pw1gp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const userCollection = client.db('bistroDB').collection('users');
        const menuCollection = client.db('bistroDB').collection('menu');
        const reviewCollection = client.db('bistroDB').collection('reviews');
        const cartCollection = client.db('bistroDB').collection('cart');
        const paymentCollection = client.db('bistroDB').collection('payments')
        const bookingsCollection = client.db('bistroDB').collection('bookings')


        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            // console.log(user)
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            // console.log(token)
            res.send({ token })
        });

        // middlewares
        const verifyToken = (req, res, next) => {
            console.log('inside verifyToken middleware', req.headers.authorization)

            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const token = req.headers.authorization.split(' ')[1];

            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
                if (error) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        };

        // use verify admin after verify token
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query)
            const isAdmin = user?.role === 'admin'
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }


        // users related api
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user?.email }
            const ifUserExist = await userCollection.findOne(query);
            if (ifUserExist) {
                return res.send({ message: 'User already exists.', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result)
            // console.log(result)
        });

        // get all users
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray()
            res.send(result)
            // console.log(result)
        });

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            console.log(req.decoded?.email)
            if (email !== req.decoded?.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin })
        });

        // make admin api
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin',
                }
            };
            const result = await userCollection.updateOne(query, updatedDoc, options);
            res.send(result);
        });

        // user deleting
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        });



        // post menu item to databse
        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const menuItem = req.body;
            const result = await menuCollection.insertOne(menuItem);
            res.send(result);
        });

        // fettch / get all menu item
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray()
            res.send(result)
        });

        // fetch / get specific menu by id
        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.findOne(query);
            res.send(result);
        });

        // patch / update specific menu data by id
        app.patch('/menu/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    name: item?.name,
                    recipe: item?.recipe,
                    price: item?.price,
                    category: item?.category,
                    image: item?.image
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        // delete a menu
        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.deleteOne(query);
            console.log(result)
            res.send(result);
        });


        // get all reviews
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray()
            res.send(result)
        });

        // get review data for specific user email
        app.get('/reviews/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await reviewCollection.find(query).toArray();
            res.send(result);
        });

        // post or save reviews to database
        app.post('/reviews', async (req, res) => {
            const reviewData = req.body;
            const result = await reviewCollection.insertOne(reviewData);
            res.send(result);
        });

        // save cart data
        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
            // console.log(result)
        });

        app.get('/carts', async (req, res) => {
            const userEmail = req.query.email;
            // console.log(userEmail)
            const query = { email: userEmail };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        });

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });



        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, 'amount inside the intent')

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            });
        });

        // store payment data/info to database
        app.post('/payments', async (req, res) => {
            const paymentData = req.body;
            const result = await paymentCollection.insertOne(paymentData);
            const query = {
                _id: {
                    $in: paymentData.cartIds.map(id => new ObjectId(id))
                }
            }
            const deleteResult = await cartCollection.deleteMany(query)

            mg.messages.create(process.env.MAILGUN_SENDING_DOMAIN, {
                from: "Excited User <mailgun@sandbox6c8dab7357f941f0aa9f037c6f13affd.mailgun.org>",
                to: ["aburayhan.bpi@gmail.com"],
                subject: "Bistro Boss Order Confirmation",
                text: "Testing some Mailgun awesomness!",
                html: `
                <div>
                    <h2>Thank you for your order.</h2>
                    <p>Your transaction Id: <strong>${paymentData?.transactionId}</strong></p>
                    
                </div>
                
                `
            })
                .then(msg => console.log(msg)) // logs response data
                .catch(err => console.error(err)); // logs any error
            res.send({ result, deleteResult })
        });

        // get all payment data or history
        app.get('/payments/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        });

        // get all collection stats for admin stats dashbaord
        // TODO:  verifyToken, verifyAdmin, 
        app.get('/admin-stats', async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0
            res.send({
                users, menuItems, orders, revenue
            });
        });

        // using aggregate pipeline
        app.get('/order-stats', async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: '$menuItemIds'
                },
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuItemIds',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: '$menuItems'
                },
                {
                    $group: {
                        _id: '$menuItems.category',
                        quantity: { $sum: 1 },
                        revenue: { $sum: '$menuItems.price' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity'
                    }
                },
            ]).toArray();
            res.send(result);
        });


        // save bookings to database
        app.post('/bookings', verifyToken, async (req, res) => {
            const bookingsData = req.body;
            const result = await bookingsCollection.insertOne(bookingsData);
            res.send(result)
        });

        // get all bokings
        app.get('/bookings', verifyToken, verifyAdmin, async (req, res) => {
            const result = await bookingsCollection.find().toArray();
            res.send(result);
        })

        // get bookings details for specific user by email
        app.get('/bookings/:email', verifyToken, async (req, res) => {
            const email = req.params?.email;
            const query = { email: email };
            const result = await bookingsCollection.find(query).toArray();
            res.send(result);
        });

        // delete a booking
        app.delete('/bookings/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const query = { _id: new ObjectId(id) };
            const result = await bookingsCollection.deleteOne(query);
            res.send(result);
        });


        // 
        app.patch('/bookings-status/:id', async (req, res) => {
            const id = req.params.id
            const { status } = req.body;
            console.log(id, status)
            const query = { _id: new ObjectId(id) };
            const result = await bookingsCollection.updateOne(
                query,
                { $set: { status: status } }
            )
            res.send(result)
        });











        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Bistro Boss is Running')
})

app.listen(port, () => {
    console.log('Bistro boss running on: ', port)
})