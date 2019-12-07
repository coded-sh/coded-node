var config = {};

config.BASE_DOMAIN = 'coded.sh'; //should be without http and https
config.PORT = process.env.PORT || 3004;
config.CLUSTER_URL = process.env.CLUSTER_URL || 'https://api.coded.sh';
config.PARSE_SERVER_URL = config.CLUSTER_URL + '/parse';
config.BALANCER_IP = process.env.BALANCER_IP || '10.53.197.244';

//Parse Server
config.PARSE_SERVER_APP_ID = process.env.PARSE_SERVER_APP_ID || 'coded';

module.exports = config;
