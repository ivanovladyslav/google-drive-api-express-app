const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const api = require("./api");
const multer = require('multer');

const upload = multer({ dest: 'uploads/'});
const app = express();
const router = express.Router();

var port = process.env.PORT || 4000;

app.use(bodyParser.json());
app.use(cors());
app.use(bodyParser.urlencoded({extended: false}));

app.use("/api", router.get('/', api.getFiles));
app.use("/api", router.post('/upload', upload.single('file'), api.upload));

app.listen(port, () => {
  console.log("Server is running on port: "+port);
});