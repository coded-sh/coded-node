const Utils = require('../utils');
const utils = new Utils();
const config = require('../config');

const request = require('request');
const exec = require('child_process').exec;

const ParseServer = require('parse-server').ParseServer;

module.exports = function(app){

  app.post('/user-domain', async (req, res) => {
    const projectDomain = req.body.projectDomain;
    const projectId = req.body.projectId;
    const token = req.body.token;
     try {
       const user = await utils.loggedUser(token);

        const options = {
            url: `${config.PARSE_SERVER_URL}` + '/classes/Project/' + projectId,
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
            if (body != ''){
              var project = JSON.parse(body);
              var domains = project.domains;
              if (domains == undefined){
                  domains = [];
              }
              domains.push(projectDomain);
              var projectsOptions = {
                  method: 'PUT',
                  json: true,
                  url: `${config.PARSE_SERVER_URL}/classes/Project/${projectId}`,
                  body: {"domains": domains},
                  headers: {
                      "X-Parse-Application-Id": config.PARSE_SERVER_APP_ID,
                      "X-Parse-Session-Token": token,
                      "Content-Type": "application/json"
                  }
              };
              request(projectsOptions, function (error, response, body) {
                if (error) {
                  console.log(error);
                }
                //Get project local ip
                var containerName = 'coded-' + project.name;
                var ipCommand = 'lxc list -c 4 ' + containerName + ' | egrep -o \"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\"';
                exec(ipCommand, function (err, stdout, stderr) {
                  var ip = "";
                  ip = String(stdout);
                  let localIp = ip.replace(/(\r\n\t|\n|\r\t)/gm, "");
                  var balancerBody = {};
                  balancerBody["domain"] = projectDomain;
                  balancerBody["ip"] = localIp;
                  balancerBody["port"] = 4000;
                  var options = {
                      method: 'POST',
                      json: true,
                      url: `http://10.53.197.244:3004/domain`, //coded-balancer container local ip
                      body: balancerBody
                  };
                  request(options, function (error, serverResponse, body) {
                      if (error != null){
                        console.log(`POST coded-balancer /domain error: ${error}`);
                      }
                  });
                  res.statusCode = 201;
                  let json = JSON.stringify({ result: true });
                  res.end(json);
                  return;
                });
              });
            }else{
              res.statusCode = 403;
              let json = JSON.stringify({ result: false, error: "Cannot find this project" });
              res.end(json);
              return;
            }
          });
     } catch (e) {
       //Invalid token
       res.statusCode = 403;
       let json = JSON.stringify({ error: "Invalid token" });
       res.end(json);
       return;
     }
  });
}
