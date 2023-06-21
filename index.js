const express = require('express');
require('dotenv').config();
const app = express();
const cors = require('cors');
const morgan = require('morgan');
const stripe = require('stripe')(process.env.PAYMENT_KEY);
const jwt = require('jsonwebtoken');

const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

app.use(morgan('dev'));

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.geakxzz.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
//! verifyJwt
const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(402).send({ error: true, message: 'unauthorize Access' });
  }
  // beater token
  const token = authorization.split(' ')[1];
  // console.log(token)
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    console.log(err);
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: 'unauthorize Access' });
    }
    req.decoded = decoded;
    console.log(decoded);
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    console.log(process.env.PAYMENT_KEY);

    const userData = client.db('SportingDb').collection('user');
    const enrolledData = client.db('SportingDb').collection('enrolledClass');
    const classesData = client.db('SportingDb').collection('classes');
    const bookedClassesData = client
      .db('SportingDb')
      .collection('bookedClasses');
    // GENERETE JWT token

    app.post('/jwt', async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN, {
        expiresIn: '7d',
      });
      console.log(token);
      console.log(email);
      res.send({ token });
    });

    // ganarate client secret
    // TODO Add jwt token
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      console.log('heeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', price);
      try {
        if (price) {
          const amount = parseFloat(price) * 100;
          const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'usd',
            payment_method_types: ['card'],
          });
          res.send({
            clientSecret: paymentIntent.client_secret,
          });
        }
      } catch (error) {
        console.log(error.message);
      }
    });

    // save user email
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const existingUser = await userData.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exist' });
      }
      const result = await userData.insertOne(user);
      res.json(result);
    });

    // booked class by student
    app.post('/bookedClass', async (req, res) => {
      const item = req.body;
      const result = await bookedClassesData.insertOne(item);
      res.json(result);
    });
    // get booking class
    app.get('/bookedClass/:email', verifyJwt, async (req, res) => {
      const email=req.params.email
      const query={
        studentEmail:email
      }
      const result = await bookedClassesData.find(query).toArray();
      res.json(result);
    });
    // delete booked class
    app.delete('/deleteBookedClass/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await bookedClassesData.deleteOne(filter);
      res.json(result);
    });
    // post new class in db
    app.post('/addclasses', async (req, res) => {
      const item = req.body;
      const result = await classesData.insertOne(item);
      res.json(result);
    });

    // get  topinstructors
    app.get('/topinstructors', async (req, res) => {
      const bestClasses = await classesData
        .aggregate([{ $sort: { numberOfStudents: -1 } }, { $limit: 6 }])
        .toArray();
      res.json(bestClasses);
    });
    // GET best classes 
    app.get('/topclasses', async (req, res) => {
      const bestClasses = await classesData
        .aggregate([
          { $match: { status: "approve" } }, 
          { $sort: { totalEnroll: -1 } },
          { $limit: 6 }
        ])
        .toArray();
      res.json(bestClasses);
    });

    // create all Instructors  getting api
    app.get('/allinstructors', async (req, res) => {
      const query = {
        role: 'instructor',
      };
      const allinstructors = await userData.find(query).toArray();
      res.json(allinstructors);
    });
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email;
      const query = {
        email: email,
      };
      const result = await userData.findOne(query);
      res.json(result);
    });

    // instructorsclass classs get
    app.get('/instructorsclass/:email', async (req, res) => {
      const instructorsMail = req.params.email;
      const query = { instructorEmail: instructorsMail };
      const result = await classesData.find(query).toArray();
      res.json(result);
    });

    // get all classes
    app.get('/admin/allclasses', verifyJwt, async (req, res) => {
      const result = await classesData.find().toArray();
      res.json(result);
    });

    app.get('/user/admin/:email', async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { email: email };
      const user = await userData.findOne(query);
      const result = { admin: user?.role === 'admin' };
      res.json(result);
    });
    app.get('/user/instructor/:email', async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { email: email };
      const user = await userData.findOne(query);
      const result = { instructor: user?.role === 'instructor' };
      res.json(result);
    });
    // student check
    app.get('/user/student/:email', async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { email: email };
      const user = await userData.findOne(query);
      const result = { student: user?.role === 'student' };
      res.json(result);
    });

    // change status of classes
    app.patch('/class/:id/status', async (req, res) => {
      const id = req.params.id;
      const newStatus = req.body.status;
      console.log(newStatus);

      const filter = { _id: new ObjectId(id) };
      const update = { $set: { status: newStatus } };

      const result = await classesData.updateOne(filter, update);
      console.log(result);

      res.json(result);
    });

    // get a single class info
    app.get('/class/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesData.findOne(query);
      res.json(result);
      // console.log(id)
    });

    // add feedback api
    app.patch('/class/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const addFeedback = req.body;
      console.log(addFeedback);
      const options = { upsert: true };
      const updateFeedback = {
        $set: {
          feedback: addFeedback.feedback,
        },
      };
      const result = await classesData.updateOne(
        filter,
        updateFeedback,
        options
      );
      res.json(result);
    });

    app.get('/admin/users', verifyJwt, async (req, res) => {
      const result = await userData.find().toArray();
      res.json(result);
    });

    

    // make admin role

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin',
        },
      };
      const result = await userData.updateOne(filter, updatedDoc);
      res.json(result);
    });
    // make instructor role
    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'instructor',
        },
      };
      const result = await userData.updateOne(filter, updatedDoc);
      res.json(result);
    });

    // approved all classes
    app.get('/approveClasses', async (req, res) => {
      const approveClasses = await classesData
        .aggregate([{ $match: { status: 'approve' } }])
        .toArray();

      res.json(approveClasses);
    });

    // save enrolled class
    app.post('/enrllodClass', async (req, res) => {
      const item = req.body;
      const result = await enrolledData.insertOne(item);
      res.json(result);
    });
    // payment on  route
    app.get('/paymentone/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const result = await bookedClassesData.findOne(filter);
      res.json(result);
    });
    // delete onsite form class
    app.patch('/enroll/class/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $inc: { availableSeats: -1, totalEnroll: +1 },
      };
      const result = await classesData.updateOne(filter, updatedDoc);
      res.json(result);
    });

    //  get all enrolled classes
    app.get('/enrolledclass/:email', verifyJwt, async (req, res) => {
      const email=req.params.email
      const query={
        studentEmail:email
      }
      const result = await enrolledData.find(query).toArray();
      res.json(result);
    });
    // payment history
    app.get('/paymenthistoys/:email',verifyJwt, async (req, res) => {
      const email=req.params.email
      const query={
        studentEmail:email
      }
      console.log(query)
      const allClass = await enrolledData.find(query).toArray();

      // Convert date strings to Date objects
      const result = allClass.map((doc) => {
        doc.date = new Date(doc.date);
        return doc;
      });

      result.sort((a, b) => b.date - a.date);

      res.json(result);
    });

    // console.log(
    //   'Pinged your deployment. You successfully connected to MongoDB!'
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Running server');
});

app.listen(port, () => {
  console.log(`running ${port}`);
});
