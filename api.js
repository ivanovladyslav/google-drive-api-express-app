const fs = require('fs');
const {google} = require('googleapis');

class Api {
  constructor() {
    this.SCOPES = ['https://www.googleapis.com/auth/drive'];
    this.TOKEN_PATH = 'token.json';
    this.AUTH = "";
    this.drive = "";
    this.oAuth2Client = "";

    this.authenticate = async (req, res) => {
      fs.readFile('credentials.json', async (err, content) => {
        const credentials = JSON.parse(content);
        const {client_secret, client_id, redirect_uris} = credentials.installed;
        this.oAuth2Client = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]);
        this.authorize(res);
      });
    }

    this.authorize = async (res) => {
      // Check if we have previously stored a token.
      fs.readFile(this.TOKEN_PATH, "utf8", async (err, token) => {
        if (err) {                   
          const authUrl = this.oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.SCOPES,
          });
          res.send(authUrl);
        } else {
          this.oAuth2Client.setCredentials(JSON.parse(token));
          const auth = this.oAuth2Client;
          this.drive = google.drive({version: 'v3', auth });
          res.send({loggedIn: true})
        }
      });
    }
    
    this.getAccessToken = (req, res) => {
      console.log(req);
      this.oAuth2Client.getToken(req.query.code, (err, token) => {
        if (err) return console.error('Error retrieving access token', err);
        this.oAuth2Client.setCredentials(token);
        // Store the token to disk for later program executions
        fs.writeFile(this.TOKEN_PATH, JSON.stringify(token), (err) => {
          if (err) return console.error(err);
          console.log('Token stored to', this.TOKEN_PATH);
          const auth = this.oAuth2Client;
          this.drive = google.drive({version: 'v3', auth });
          res.sendFile('./popup-close.html', {root: __dirname });
        });
      });
    }

    this.popupClose = (req, res) => {
      res.send('./popup-close.html');
    }

    this.isAuthenticated = (req, res) => {
      if(this.drive != "") {
        res.send({loggedIn: true})
      }
    }

    this.upload = async (req, res) => {
        var fileMetadata = {
          'name': req.file.originalname
        };
        var media = {
          mimeType: req.file.mimetype,
          body: fs.createReadStream(`./uploads/${req.file.filename}`)
        };
        this.drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id'
        }, (err) => {
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
                    "name": req.file.originalname,
                    "x": 100,
                    "y": 100,
                    "text": ""
                  }
                );
                const json = JSON.stringify(workspace);
                fs.writeFileSync('./workspace.json', json);
              }
            });
            res.send();
          }
        });
    }
    
    this.uploadText = async (req, res) => {
      console.log(req.body);
      fs.readFile('./workspace.json', (err, data) => {
        if(err) {console.log(err)}
        else {
          const workspace = JSON.parse(data);
          workspace.files.push(
            {
              "id": workspace.files.length,
              "name": "note"+workspace.files.length,
              "x": 100,
              "y": 100,
              "text": ""
            }
          );
          const json = JSON.stringify(workspace);
          fs.writeFileSync('./workspace.json', json);
        }
      });
      res.send();
    }

    this.getFiles = async (req, res) => { 
      const filesData = fs.readFileSync('./workspace.json');
      const workspace = JSON.parse(filesData);
      const filesToSend = [];
      console.log(this.drive);
      this.drive.files.list({
        pageSize: 1000,
        fields: 'nextPageToken, files(id, name, thumbnailLink, webViewLink)',
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
            let workspaceFile = await this.containsValue(workspace.files, file.name, false);
            if(workspaceFile) {
              const fileToAdd = {
                "id": workspaceFile.id,
                "name": file.name,
                "thumbnailLink": file.thumbnailLink,
                "link": file.webViewLink,
                "x": workspaceFile.x,
                "y": workspaceFile.y,
                "text": workspaceFile.text
              }
              filesToSend.push(fileToAdd);
            }
          });

          let notes = await this.containsValue(workspace.files, "note", true);
          for(let i = 0; i < notes.length; i++) {
            const fileToAdd = {
              "id": notes[i].id,
              "name": notes[i].name,
              "thumbnailLink": "",
              "link": "",
              "x": notes[i].x,
              "y": notes[i].y,
              "text": notes[i].text
            }
            filesToSend.push(fileToAdd);
          }
          

          filesToSend.sort((a, b) => {
            return a.id - b.id;
          })
          console.log(filesToSend);
          res.send(filesToSend);
        } else {
          console.log('No files found.');
        }
      })
    }
    
    this.containsValue = (arr, value, include) => {
      if(!include) {
        for(let i = 0; i < arr.length; i++) {
          if(arr[i].name == value) {
            return arr[i];
          }
        }
      } else {
        let ta = [];
        for(let i = 0; i < arr.length; i++) {
          if(arr[i].name.includes(value)) {
            ta.push(arr[i]);
          }
        }
        return ta;
      }
      return;
    }

    this.save = (req, res) => {
      const filesData = fs.readFileSync('./workspace.json');
      const workspace = JSON.parse(filesData);
      console.log(res.body);

      for(let i = 0; i < req.body.length; i++) {
        for(let j = 0; j < workspace.files.length; j++) {
          if(workspace.files[j].name == req.body[i].name) {
            workspace.files[j].x = req.body[i].x;
            workspace.files[j].y = req.body[i].y;
            workspace.files[j].text = req.body[i].text;
          }
        }
      }

      const json = JSON.stringify(workspace);
      fs.writeFileSync('./workspace.json', json);
    }
  }
}

module.exports = Api;