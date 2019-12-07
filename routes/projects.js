const Utils = require('../utils');
const utils = new Utils();
const config = require('../config');

var qs = require('querystring');
const request = require('request');
const network = require('network');
const exec = require('child_process').exec;
const data_store = require('data-store'),
store = new data_store('coded'); //Used for saving ports

const ParseServer = require('parse-server').ParseServer;

module.exports = function(app){

  app.post('/project', async (req, res) => {

    const projectName = req.body.projectName;
    const projectType = req.body.projectType;
    const serverId = req.body.serverId;
    const token = req.body.token;
    console.log("token: " + token);

     try {
       const user = await utils.loggedUser(token);

       //Check if a project with projectName is created before
        const query = qs.stringify({
          where: JSON.stringify({
            name: projectName
          })
        });
        const options = {
            url: `${config.PARSE_SERVER_URL}` + '/classes/Project?' + query,
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
            var projects = [];
            if (body != ''){
              projects = JSON.parse(body).results;
              if (projects != undefined && projects.length != 0){
                //This app name is already used
                res.statusCode = 403;
                let json = JSON.stringify({ result: false, error: "This name is already used" });
                res.end(json);
                return;
              }
            }

            //Get available port for SSH
            //Get new port for git connection
            var port = store.get('available_port');
            if (port == undefined) {
                port = 5000;
            }
            store.set('available_port', parseInt(port) + 1);

            var newProject = {};
            var url = `${config.PARSE_SERVER_URL}/classes/Project`;
            newProject["name"] = projectName;
            newProject["status"] = "setup";
            newProject["port"] = port;

            var ACL = {};
            ACL[user.id] = {read: true, write: true}
            ACL["*"] = {}
            newProject["ACL"] = ACL;
            var options = {
                method: 'POST',
                json: true,
                url: url,
                body: newProject,
                headers: {
                    "X-Parse-Application-Id": config.PARSE_SERVER_APP_ID,
                    "X-Parse-Session-Token": token,
                    "Content-Type": "application/json"
                }
            };
            request(options, function (error, serverResponse, newProjectBody) {
              console.log(serverResponse);
              console.log(error);
              let projectId = newProjectBody.objectId;

              if (error) {
                utils.handleError(res, error, 403);
                return;
              }

              //Update Projects field on a Server object
              const serverOptions = {
                  url: `${config.PARSE_SERVER_URL}/classes/Server/${serverId}`,
                  headers: {
                      "X-Parse-Application-Id": config.PARSE_SERVER_APP_ID,
                      "X-Parse-Session-Token": token
                  }
              };
              request(serverOptions, function (error, response, body) {
                  if (error) {
                    utils.handleError(res, error, 403);
                    return;
                  }
                  var serverObject = JSON.parse(body);
                  var serverIp = serverObject.ip;
                  var projects = serverObject.projects;

                  if (projects == undefined){
                    projects = [];
                  }
                  projects.push(projectId);
                  var projectsOptions = {
                      method: 'PUT',
                      json: true,
                      url: `${config.PARSE_SERVER_URL}/classes/Server/${serverId}`,
                      body: {"projects": projects},
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
                  });

                  //Create new container (one container for each app)
                  var containerName = 'coded-' + projectName;
                  var command = 'lxc launch coded:coded-' + projectType + ' ' + containerName;

                  console.log('Container name: ' + containerName);
                  console.log('Command: ' + command);
                  exec(command, function (err, stdout, stderr) {

                    //Wait until new container will be ready and will receive an IP address
                    console.log('Waiting for ip address of a container');

                    //Waiting while new container will receive ip
                    var ipCommand = 'lxc list -c 4 ' + containerName + ' | egrep -o \"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\"';
                    console.log('Command: ' + ipCommand);

                    var timer = setInterval(function () {
                        exec(ipCommand, function (err, stdout, stderr) {
                            var ip = "";
                            ip = String(stdout);
                            var localIp = ip.replace(/(\r\n\t|\n|\r\t)/gm, "");
                            if (localIp == '') {
                                console.log('Waiting for IP');
                            }else{
                              console.log('Local IP received - ' + localIp);
                              clearInterval(timer);

                              //Set iptables for SSH and db access
                              network.get_active_interface(function (err, obj) {
                                  console.log(err || obj); // should return your public IP address

                                  if (err == null) {
                                      var ethInterface = obj.name;

                                      //Map ssh for user git
                                      var iptablesCommand = 'sudo iptables -t nat -I PREROUTING -i ' + ethInterface + ' -p TCP -d ' + serverIp + '/32 --dport ' + port + ' -j DNAT --to-destination ' + localIp + ':22';
                                      console.log('Map container ssh and db');
                                      console.log('Command: ' + iptablesCommand);
                                      exec(iptablesCommand, function (err, stdout, stderr) {
                                        console.log("Error: ", err); // should return your public IP address
                                          //Add port for DB if needed
                                          if (req.params.type == 'mongodb'){
                                            var iptablesCommandDB = 'sudo iptables -t nat -I PREROUTING -i ' + ethInterface + ' -p TCP -d ' + serverIp + '/32 --dport ' + portDB + ' -j DNAT --to-destination ' + localIp + ':27017';
                                            exec(iptablesCommandDB, function (err, stdout, stderr) {
                                            });
                                          }
                                        });

                                        var coded_container_timer = setInterval(function () {

                                          //Waiting until Coded Container will be ready inside new container
                                          const options = {
                                              url: `http://${localIp}:3004/hey`
                                          };
                                          request(options, function (error, response, body) {
                                              if (error == null) {
                                                var result = JSON.parse(body).result;
                                                if (result == true){
                                                  clearInterval(coded_container_timer);
                                                  console.log(`Coded Container started inside a container with IP: ${localIp}`);
                                                  let projectPort = 4000;
                                                  //Create new project
                                                  var params = {};
                                                  params["projectName"] = projectName;
                                                  params["projectType"] = projectType;
                                                  params["port"] = projectPort;
                                                  params["token"] = token;
                                                  var postProjectOptions = {
                                                      method: 'POST',
                                                      json: true,
                                                      url: `http://${localIp}:3004/project`,
                                                      body: params,
                                                      headers: {
                                                          "Content-Type": "application/json"
                                                      }
                                                  };
                                                  request(postProjectOptions, function (error, postProjectResponse, postProjectBody) {
                                                    if (error) {
                                                      console.log(`Error: ${error}`);
                                                    }
                                                    console.log(postProjectBody);
                                                    //Reload SSH keys
                                                    const options = {
                                                        method: 'GET',
                                                        json: true,
                                                        url: `http://localhost:3004/reload-ssh-keys`,
                                                        body: {"token": token}
                                                    };
                                                    request(options, function (error, response, body) {
                                                        if (error != null) {
                                                            console.log(`GET /reload-ssh-keys error: ${error}`);
                                                        }
                                                        //Update Project status
                                                        console.log(`GET /reload-ssh-keys response: ${body}`);
                                                        var projectsOptions = {
                                                            method: 'PUT',
                                                            json: true,
                                                            url: `${config.PARSE_SERVER_URL}/classes/Project/${projectId}`,
                                                            body: {"status": "ready"},
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
                                                        });

                                                        //Add subdomain to DNS
                                                        var subdomainBody = {};
                                                        subdomainBody["token"] = token;
                                                        subdomainBody["subdomain"] = projectId;
                                                        subdomainBody["serverIP"] = serverIp;
                                                        var options = {
                                                            method: 'POST',
                                                            json: true,
                                                            url: `${config.CLUSTER_URL}/subdomain`,
                                                            body: subdomainBody
                                                        };
                                                        request(options, function (error, serverResponse, body) {
                                                            if (error != null){
                                                              console.log(`POST /subdomain error: ${error}`);
                                                            }
                                                        });

                                                        //Add new record to coded-balancer
                                                        var balancerBody = {};
                                                        balancerBody["domain"] = `${projectId.toLowerCase()}.coded.sh`;
                                                        balancerBody["ip"] = localIp;
                                                        balancerBody["port"] = projectPort;
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
                                                    });
                                                  });
                                                }
                                              }
                                          });
                                        }, 3000);
                                        //End of waiting until Coded Container will start
                                      }
                                  });
                            }
                        });
                    }, 5000);
                  });
                  
              });

              res.statusCode = 201;
              let json = JSON.stringify({ result: true, projectId: newProjectBody.objectId });
              res.end(json);
              return;
            });

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
