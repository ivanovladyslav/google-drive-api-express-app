const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const Api = require("./api");
const multer = require('multer');

const upload = multer({ dest: 'uploads/'});
const app = express();
const router = express.Router();

var port = process.env.PORT || 4000;

app.use(bodyParser.json());
app.use(cors());
app.use(bodyParser.urlencoded({extended: false}));

api = new Api();

app.use("/api", router.get('/', api.getFiles));
app.use("/api", router.post('/upload', upload.single('file'), api.upload));
app.use("/api", router.get('/getAccessToken', api.getAccessToken));
app.use("/api", router.get('/authenticate', api.authenticate));
app.use("/api", router.get('/isAuthenticated', api.isAuthenticated));
app.use("/api", router.get('/popup-close', api.popupClose));
app.use("/api", router.get('/getWorkspaces', api.getWorkspaces));
app.use("/api", router.post('/save', api.save));
app.use("/api", router.post('/upload-text', api.uploadText));
app.use("/api", router.post('/delete', api.delete));
app.use("/api", router.post('/createWorkspace', api.createWorkspace));

app.listen(port, () => {
  console.log("Server is running on port: "+port);
});