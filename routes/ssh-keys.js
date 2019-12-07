let Utils = require('../utils');
let utils = new Utils();
let config = require('../config');

let request = require('request');
let network = require('network');

let exec = require('child_process').exec;

module.exports = function(app){

  app.get('/reload-ssh-keys', async (req, res) => {
    const token = req.body.token;
    try {
      const user = await utils.loggedUser(token);
      var sshKeys = user.get("sshKeys");
      if (sshKeys != undefined){
        //Load all user projects
        var options = {
          url: `${config.PARSE_SERVER_URL}/classes/Project`,
          headers: {
            "X-Parse-Application-Id": config.PARSE_SERVER_APP_ID,
            "X-Parse-Session-Token": token
          }
        };
        request(options, function (error, response, body) {
          if (error) {
            utils.handleError(res, error, 403);
            return;
          }
          var projects = JSON.parse(body).results;
          for (i = 0; i < projects.length; i++) {
            let project = projects[i];
            //Get ip address for this project
            var containerName = 'coded-' + project.name;
            var ipCommand = 'lxc list -c 4 ' + containerName + ' | egrep -o \"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\"';
            exec(ipCommand, function (err, stdout, stderr) {
              var ip = "";
              ip = String(stdout);
              let localIp = ip.replace(/(\r\n\t|\n|\r\t)/gm, "");

              console.log(`Reload keys for a container with IP ${localIp}, ${project.name}`);
              var sshOptions = {
                  method: 'POST',
                  json: true,
                  url: `http://${localIp}:3004/ssh-keys`,
                  body: {"sshKeys": sshKeys},
                  headers: {
                      "Content-Type": "application/json"
                  }
              };
              request(sshOptions, function (error, serverResponse, sshKeyBody) {
                if (error) {
                  console.log(`Error: ${error}`);
                }
              });
            });
          }
          res.statusCode = 201;
          let json = JSON.stringify({ result: true });
          res.end(json);
          return;
        });
      }
    } catch (e) {
      //Invalid token
      res.statusCode = 403;
      let json = JSON.stringify({ error: "Invalid token" });
      res.end(json);
      return;
    }
  });

}
