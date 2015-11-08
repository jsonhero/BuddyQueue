var fs = require('fs');

function display (route, res) {
    var contents = fs.readFileSync('./client/views/' + route + '.html', {encoding: 'utf8'});
    res.write(contents);
}
module.exports.display = display;