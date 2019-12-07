const Parse = require('parse/node');

class Utils {
  replaceAll(str, find, replace) {
      return str.replace(new RegExp(find, 'g'), replace);
  }

  handleError(res, error, statusCode){
    console.error(error)
    let json = JSON.stringify({ error: error.message });
    res.statusCode = statusCode;
    res.end(json);
  }

  async loggedUser(sessionToken) {
    const loggedUserSessionQuery = new Parse.Query(Parse.Session);
    loggedUserSessionQuery.equalTo('sessionToken', sessionToken);
    loggedUserSessionQuery.include('user');

    const loggedUserSession = await loggedUserSessionQuery.first({
      sessionToken
    });

    if (!loggedUserSession) {
      return null;
    }
    console.log(loggedUserSession.get('user'));
    return loggedUserSession.get('user');
  }
}

module.exports = Utils;
