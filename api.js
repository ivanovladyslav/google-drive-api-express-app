const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = 'token.json';

exports.upload = async function(req, res) {
  fs.readFile('credentials.json', async (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    const auth = await authorize(JSON.parse(content));
    const drive = await google.drive({version: 'v3', auth});
    var fileMetadata = {
      'name': req.file.originalname
    };
    var media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(`./uploads/${req.file.filename}`)
    };
    drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    }, function (err, file) {
      if (err) {
        console.error(err);
      } else {
        fs.readFile('./workspace.json', (err, data) => {
          if(err) {console.log(err)}
          else {
            const workspace = JSON.parse(data);
            workspace.files.push(
              {
                "id": workspace.files.length,
                "name": req.file.originalname
              }
            );
            const json = JSON.stringify(workspace);
            fs.writeFileSync('./workspace.json', json);
          }
        });
        res.send();
      }
    });
    
  });
}

exports.getFiles = function(req, res) { 
    console.log("ok");
    fs.readFile('credentials.json', async (err, content) => {
        if (err) return console.log('Error loading client secret file:', err);
        // Authorize a client with credentials, then call the Google Drive API.
        const token = await authorize(JSON.parse(content));
        listFiles(token, res);
    });
}
  
  async function authorize(credentials) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);
    // Check if we have previously stored a token.
    const token = fs.readFileSync(TOKEN_PATH, "utf8", async (err, token) => {
      if (err) return getAccessToken(oAuth2Client);
    });
    console.log(token);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  }
  
  function getAccessToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('Error retrieving access token', err);
        oAuth2Client.setCredentials(token);
        // Store the token to disk for later program executions
        fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
          if (err) return console.error(err);
          console.log('Token stored to', TOKEN_PATH);
        });
        console.log("GetAccessToken "+oAuth2Client);
        return oAuth2Client;
      });
    });
  }
  
  async function listFiles(auth, res) {
    const drive = await google.drive({version: 'v3', auth});
    const filesData = fs.readFileSync('./workspace.json');
    const workspace = JSON.parse(filesData);
    const filesToSend = [];
    await drive.files.list({
      pageSize: 1000,
      fields: 'nextPageToken, files(id, name, thumbnailLink)',
      q: 
      `mimeType = 'application/vnd.google-apps.document' 
      or mimeType = 'application/pdf' 
      or mimeType = 'image/png' 
      or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'`
    }, async (err, response) => {
      if (err) return console.log('The API returned an error: ' + err);
      const files = await response.data.files;
      if (files.length) {
        await files.map(async (file) => {
          let workspaceFile = await containsValue(workspace.files, file.name);
          if(workspaceFile) {
            console.log(workspaceFile);
            const fileToAdd = {
              "id": workspaceFile.id,
              "name": file.name,
              "thumbnailLink": file.thumbnailLink,
            }
            filesToSend.push(fileToAdd);
          }
          filesToSend.sort((a, b) => {
            return a.id - b.id;
          })
        })
        console.log(filesToSend);
        res.send(filesToSend);
      } else {
        console.log('No files found.');
      }
    })
  }

function containsValue(arr, value) {
  for(i = 0; i < arr.length; i++) {
    if(arr[i].name == value) {
      return arr[i];
    } 
  }
  return;
}