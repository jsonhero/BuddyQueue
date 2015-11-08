var http = require ('http');
var https = require ('https');
// Need to load both since Smite runs on http and LoL runs on https
var crypto = require('crypto');
var path = require('path');
var WebSocketServer = require('websocket').server;
var fs = require('fs');
var renderer = require('./renderer.js');

//Constants
var SMITE = "smite", LOL = "lol", SMITE_DEV_ID = "XXXX", SMITE_AUTH_KEY = "XXXXXXXXXXXXXXXXXXX", LOL_AUTH_KEY="XXXXXXXXXXXXXXXXXXXX";
//Clients
var clients = {}, clientCount = 0;
//Session stuff
var smiteSessionID = null;
//Stupid fucking smite fucking ques
var SmiteQs = {
  leagueconquest: 451,
  leaguejoust: 440,
  conquest: 426,
  motd: 465,
  arena: 435,
  assault: 445,
  joust: 448
};
var scoreThreshold = 2; //If the difference between scores of players is greater than this, then we'll keep them out.

// Conquest5v5 = 423,
// NoviceQueue = 424,
// Conquest = 426,
// Practice = 427,
// ConquestChallenge = 429,
// ConquestRanked = 430,
// Domination = 433,
// MOTD = 434 (use with 465 to get all MOTD matches),
// Arena = 435,
// ArenaChallenge = 438,
// DominationChallenge = 439,
// JoustLeague = 440,
// JoustChallenge = 441,
// Assault = 445,
// AssaultChallenge = 446,
// Joust3v3 = 448,
// ConquestLeague = 451,
// ArenaLeague = 452


var parties = [];
parties['smite'] = [];
parties['lol'] = [];
parties['dota'] = [];

//Prototypes
Date.prototype.formattime = function() {
  var yyyy = this.getUTCFullYear().toString();
  var MM = (this.getUTCMonth()+1).toString(); // getMonth() is zero-based
  var dd  = this.getUTCDate().toString();
  var HH = this.getUTCHours().toString();
  var mm = this.getUTCMinutes().toString();
  var ss = this.getUTCSeconds().toString();
  return yyyy + (MM?MM:"0"+mm[0]) + (dd[1]?dd:"0"+dd[0]) +  (HH[1]?HH:"0"+HH[0]) +  (mm[1]?mm:"0"+mm[0]) + (ss[1]?ss:"0"+ss[0]); // padding
};

function decimalAdjust(type, value, exp) {
    // If the exp is undefined or zero...
    if (typeof exp === 'undefined' || +exp === 0) {
      return Math[type](value);
    }
    value = +value;
    exp = +exp;
    // If the value is not a number or the exp is not an integer...
    if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
      return NaN;
    }
    // Shift
    value = value.toString().split('e');
    value = Math[type](+(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp)));
    // Shift back
    value = value.toString().split('e');
    return +(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp));
  }

if (!Math.round10) {
    Math.round10 = function(value, exp) {
      return decimalAdjust('round', value, exp);
    };
}

function sessionRefresh(){
  console.log("NEW SESSION");
  smiteRequest("createsession",null,function(data){
    var obj = JSON.parse(data);
    smiteSessionID = obj.session_id;
  },function(e){
    console.log(e);
  });
}

var server = http.createServer(function(req, res) {
  var url = req.url.toLowerCase();
  if (!fileServe(req, res)) {
    switch (url) {
      case '/':
         res.writeHead(200, {'Content-Type': 'text/html'});
         renderer.display('header', res);
         renderer.display('footer', res);
         res.end();
        break;
      default:
        res.writeHead(404, {'Content-Type':'text/html'} )
        //renderer.display('header', res);
        renderer.display('error', res);
        //renderer.display('footer', res);
        res.end();
        break;
    }
  }
});

server.listen(80, function() {
  console.log('Server running on port 80');
  sessionRefresh();
  setInterval(sessionRefresh,14*60*1000); //Create 1 every 14 minutes... I don't trust HiRez
});

function constructWebRequest(requester,options,callback,error){
  console.log(options);
  var req = requester.request(options,function(res){
    if (res.statusCode !== 200){
      error(res.statusCode);
      return;
    }
    var data = "";
    res.on('data', function(chunk) {
      data += chunk;
    });
    res.on("end",function(){
      callback(data);
    });
  });
  req.on("error",function(e){
    console.log("An error hath occured "+e);
    if (error) error(e);
  });
  req.end();
}

function fileServe(req, res) {
  try {
  var encoding = 'utf8', contentType = '';
  var filePath = "." + req.url;
  var ext = path.extname(filePath);

  switch (ext) {
    case '.css':
      contentType = 'text/css';
      break;
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.png':
      contentType = 'image/png';
      encoding = 'binary';
      break;
    case '.jpg':
      contentType = 'image/jpg';
      encoding = 'binary';
      break;
    case '.gif':
      contentType = 'image/gif';
      encoding= 'binary';
      break;
    case ".ttf":
      contentType = "font/ttf";
      encoding = "binary";
      break;
    case ".woff":
      contentType = "application/x-font-woff";
      encoding = "binary";
      break;
    case ".woff2":
      contentType = "application/font-woff2";
      encoding = "binary";
      break;
    case ".ogg":
      contentType = "application/ogg";
      encoding = "binary";
  }

  if (contentType) {
    var contents = fs.readFileSync(filePath, {encoding: encoding}); //Loads the requested file contents, ex. CSS template
    res.writeHead(200, {'Content-Type': contentType});
    res.end(contents, encoding); //Renders the file on the webpage
    return true;
  } else {
    return false;
  }
  } catch (error){
    console.log(error);
  }
}

var wsServer = new WebSocketServer({
  httpServer: server
});


wsServer.on('request', function(req) {
  var connection = req.accept('echo-protocol', req.origin);
  var id = clientCount++;
  clients[id] = {connection: connection, id:id};
  console.log('Client ' + id + ' connected.');
  connection.on('message', function(data) {
    data = JSON.parse(data.utf8Data);
    if (data.type.endsWith("Request")){
      requestHandles[data.type](clients[id],data);
    } else {
      responseHandles[data.type](clients[id],data);
    }
  });

  connection.on('close', function() {
    if (clients[id].profile && clients[id].profile.party){
      clients[id].profile.party.removeMember(clients[id].profile);
    }
    delete clients[id];
    console.log('Client ' + id + ' disconnected.');
  });
});

var requestHandles = {
  htmlRequest : function(client,data){
     retrievePage(client, data);
     if (data.route === 'home'){
       if (client.profile && client.profile.party){
         client.profile.party.removeMember(client.profile);
       }
     }
     if (data.route === 'party'){
       findParty(client.profile);
     }
  },
  searchRequest : function(client,data){
    client.profile = null;
    var hit = false;
    for (var cl in clients){
      if (clients[cl].profile && clients[cl].profile.sitename.toLowerCase() == data.searchEntry.toLowerCase()){
        wsSend(client.connection,constructResponse("search",{error:""+data.searchEntry+" is already looking for a party."}));
        hit = true;
      }
    }
    // retrieveProfile(data.searchEntry,data.game.toLowerCase(),client,data.partyCount)
    if (!hit){
      retrieveProfile(data.searchEntry,data.game.toLowerCase(),client,data.partyCount,data.regionLol.toLowerCase());
    }
    // retrievePage(client, 'party');
    // console.log(client.profile);
    // retrievePage(client, 'partyMember', client.profile)
  },
  findPartyRequest: function(client,data){
    if (client.profile.party){
      client.profile.party.removeMember(client.profile);
      findParty(client.profile);
    }
  },
  sendMessageRequest: function(client,data){
    client.profile.sendMessage(client.profile,data.message);
    if (client.profile.party){
      client.profile.party.members.forEach(function(member){
        if (member === client.profile) return;
       member.sendMessage(client.profile,data.message)
      });
    }
  }
};

var responseHandles = {

};

function constructResponse(type, options){
    var req = {type: type+"Response"};
    for (var key in options){
        req[key] = options[key];
    }
    return req;
}

function constructRequest(type, options){
    var req = {type: type+"Request"};
    for (var key in options){
        req[key] = options[key];
    }
    return req;
}

function retrievePage(client, data) {
  var page = fs.readFileSync('./client/views/' + data.route + '.html', {encoding: 'utf8'});
  if (data.route == 'party') {//Now using id's for easy DOM manipulation instead of floating individual party member elements.
    var elements = [];
    for (var i = 1; i <= data.size; i++) {
      elements.push('<div class="slot" id="'+ i +'"></div>');
    }
    page = keyReplacer(page, [{match: '{{partySize}}', value: elements.join('')}]);
  }
  wsSend(client.connection, constructResponse("html",{page:page,route:data.route}));
}

function retrieveParty(client, profiles) {
  if (!client || !client.profile || !client.profile.party) return;
  console.log(client, 'Look at me Im a client');
  var template = fs.readFileSync('./client/views/partyMember.html', {encoding: 'utf8'});
  var fakeTemplate = fs.readFileSync('./client/views/fakeMember.html', {encoding: 'utf8'});
  function fillTemplate(profile, type) {
    var filledTemplate = '';
    var keys = [
      {match: '{{avatar}}', value: profile['avatar']},
      {match: '{{who}}', value: client.profile === profile ? 'user-self' : 'user-' + profile.username },
      {match: '{{userName}}', value: profile['username']},
      {match: '{{level}}', value: profile['level']},
      {match: '{{wlr}}', value: Math.round10(profile['wl'],-2)},
      {match: '{{wins}}', value: profile['wins']},
      {match: '{{loses}}', value: profile['losses']},
      {match: '{{kdr}}', value: Math.round10(profile['kd'],-2)},
      {match: '{{kills}}', value: profile['kills']},
      {match: '{{deaths}}', value: profile['deaths']}
     ];
    filledTemplate = keyReplacer(template, keys);
    return filledTemplate;
  }

  var members = [];
  for (var prof in profiles){
    if (client.profile === profiles[prof]) { //set self to #1 spot
      members.unshift({template: fillTemplate(profiles[prof], 'player'), name:profiles[prof].username, self: true});
    } else {
      members.push({template: fillTemplate(profiles[prof], 'player'), name:profiles[prof].username, self: false});
    }
  }

  for (var i = members.length + 1; i <= client.profile.party.size; i++) {
      members.push({template: fakeTemplate, name: 'fake'});
  }

  wsSend(client.connection, constructResponse('party', {members: members}));
}

function keyReplacer(page, keys) {
    keys.forEach(function(key) {
        page = page.replace(key.match, key.value);
    });
    return page;
}


function wsSend (connection, data) { //Send JSON data to browser client.
	if (connection == 'all') {
		for (var i in clients) {
			clients[i].connection.send(JSON.stringify(data));
		}
	} else {
		connection.send(JSON.stringify(data));
	}
}

function retrieveProfile(name,game,client,partyCount,region) {
  switch(game){
    case SMITE:
      retrieveSmiteProfile(name,client,game,partyCount);
      break;
    case LOL:
      retrieveLolProfile(name,client,game,partyCount,region);
      break;
  }
}


function smiteRequest(what,params,callback,error){
  var date = new Date();
  var hash = crypto.createHash('md5').update(SMITE_DEV_ID+what+SMITE_AUTH_KEY+date.formattime()).digest("hex");
  constructWebRequest(http,{host:"api.smitegame.com",path:"/smiteapi.svc/"+what+"Json/"+SMITE_DEV_ID+"/"+hash+"/"+(smiteSessionID && params ? smiteSessionID+"/" : "")+date.formattime()+(params ? "/"+params : "")},callback,error);
}

function retrieveSmiteProfile(name,client,game,partyCount) {
  smiteRequest("getplayer",name,function(data){
    console.log("LOADING "+name);
    try {
        var obj = JSON.parse(data);
    } catch (err){
      //Invalid JSON, don't crash!
    }
        if (!obj || obj.length < 1){
          wsSend(client.connection,constructResponse("search",{error:"Username not found."}));
          return;
        }
        obj = obj[0];
        var profile = new Profile(name,obj.Name,"",client.id,game,partyCount,obj.Level,obj.Avatar_URL);
        client.profile = profile;
        var kills = 0, deaths = 0, wins = 0, losses = 0, statsDone = 0;
        for (var q in SmiteQs){
          smiteRequest("getqueuestats",name+"/"+SmiteQs[q],function(dat){
            var obj2 = JSON.parse(dat);
            for (var k in obj2){
              var v = obj2[k];
              kills += v.Kills;
              deaths += v.Deaths;
              wins += v.Wins;
              losses += v.Losses;
            }
            statsDone++;
            if (statsDone == 7){
                profile.setStats(kills,deaths,wins,losses);
                wsSend(client.connection,constructResponse("search",{profile:profile}));
            }
          },function(e){
            console.log(e);
          });
        }
        //now get the q stats
        //TODO Send back packet saying all is good.
  },function(e){
    console.log(e);
    wsSend(client.connection,constructResponse("search",{error:""+e.toString()}));
  });
}


function retrieveLolProfile(name,client,game,partyCount,region) {
  constructWebRequest(https,{host:region+".api.pvp.net",path:"/api/lol/"+region+"/v1.4/summoner/by-name/"+name+LOL_AUTH_KEY},function(data){
    var obj = JSON.parse(data);
    for (var k in obj){
      if (k != name.toLowerCase()) continue;
      obj = obj[k];
      var profile = new Profile(name,name,obj.id,client.id,game,partyCount,obj.summonerLevel,"http://ddragon.leagueoflegends.com/cdn/5.22.1/img/profileicon/"+obj.profileIconId+".png",region);
      client.profile = profile;
      constructWebRequest(https,{host:region+".api.pvp.net",path:"/api/lol/"+region+"/v1.3/stats/by-summoner/"+profile.id+"/ranked"+LOL_AUTH_KEY},function(data){
        var obj = JSON.parse(data);
        var kills = 0, deaths = 0, wins = 0, losses = 0;
        obj.champions.forEach(function(val){
          var stat = val.stats;
          kills += stat.totalChampionKills;
          deaths += stat.totalDeathsPerSession;
          wins += stat.totalSessionsWon;
          losses += stat.totalSessionsLost;
        });
        profile.setStats(kills,deaths,wins,losses);
        wsSend(client.connection,constructResponse("search",{profile:profile}));
      },function(e){
        client.profile = null;
         wsSend(client.connection,constructResponse("search",{error:""+e.toString()}));
      });
      return;
    }
    wsSend(client.connection,constructResponse("search",{error:"Username not found"}));
  },function(e){
     if (e === 404) wsSend(client.connection,constructResponse("search",{error:"Username not found"}));
     else {
       console.log(e);
       wsSend(client.connection,constructResponse("search",{error:""+e.toString()}));
     }
  });
}

function findParty(profile){
  var newparties = [];
  var lowestScore = 999, closestParty;
  for (var k in parties[profile.gamemode]){
    var val = parties[profile.gamemode][k];
   // console.log(val);
    if (val.members.length == 0 || val.size == 0) continue;
    console.log(""+val.size+" "+profile.number);
    console.log(val.size == profile.number);
    console.log(Math.abs(profile.getScore() - val.getAverageScore()) < scoreThreshold);
    if(val.size == profile.number && val.members.length < val.size && Math.abs(profile.getScore() - val.getAverageScore()) < scoreThreshold && val.getAverageScore() < lowestScore && val.region === profile.region) {
        lowestScore = val.getAverageScore();
        closestParty = val;
    }
    //We're going to see if we can't combine some parties while we're at it...
    parties[profile.gamemode].forEach(function(val2,key2){
        if (val2 !== val && val2.size == val.size && val2.members.length + val.members.length <= val.size && Math.abs(val.getAverageScore() - val2.getAverageScore()) < scoreThreshold){
           val2.members.forEach(function(memb,key){
             val.addMember(memb);
           });
           console.log("EHH");
           val.size = 0;
        }
    });
    newparties.push(val);
  }
  if (!closestParty){
    console.log("NO CLOSEST PART!");
     var party = new Party(profile.number);
     //console.log(party);
     party.addMember(profile);
     newparties.push(party);
  } else {
    closestParty.addMember(profile);
  }
  //console.log(newparties);
  parties[profile.gamemode] = newparties;
}

function Profile(sitename,name,id,clientid,gamemode,number,level,avatar,region){ //I know it isn't necessairy to have all of these variables, but it keeps things organized in my head :P.
  this.username = name;
  this.sitename = sitename;
  this.id = id;
  this.clientid = clientid;
  this.gamemode = gamemode;
  this.number = number;
  this.region = region;
  this.level = level;
  this.avatar = avatar;
  this.kills = 0;
  this.deaths = 0;
  this.wins = 0;
  this.losses = 0;
  this.kd = 0.0;
  this.wl = 0.0;
  this.party;
  this.getClient = function(){
    return clients[clientid];
  };
  this.setStats = function(kills,deaths,wins,losses){
    this.kills = kills;
    this.deaths = deaths;
    this.wins = wins;
    this.losses = losses;
    this.kd = kills / (deaths === 0 ? 1 : deaths);
    this.wl = wins / (losses === 0 ? 1 : losses);
  };
  this.getScore = function(){
    return this.level + this.kd + this.wl;
  };
  this.sendParty = function(party){
    retrieveParty(this.getClient(), party.members);
    //wsSend(prof.getClient(), constructResponse('party', {members: party.members}));
  };
  this.sendMessage = function(sender,message){
    var msg = fs.readFileSync('./client/views/message.html', {encoding: 'utf8'});
    var date = new Date();
    msg = msg.replace("{{avatar}}",sender.avatar).replace("{{id}}",sender === this ? "self" : "other").replace("{{userName}}",sender.username).replace("{{message}}",message);
    if (!this.getClient()) return;
    wsSend(this.getClient().connection,constructResponse("sendMessage",{message:msg}));
  };
}

function Party(size, region){
  this.size = size;
  this.members = [];
  this.region = region;
  this.addMember = function(profile){
    this.members.push(profile);
    var party = this;
    profile.party = this;
     this.members.forEach(function(val,key){
      val.sendParty(party);
    });
  };
  this.removeMember = function(profile){
    this.members = this.members.filter(function(member) {
      if (member === profile) return false;
      return true;
    });
    profile.party = null;
    var party = this;
    this.members.forEach(function(val,key){
      val.sendParty(party);
    });
  };
  this.getAverageScore = function(){
    if (this.members.length === 0) return 0;
    var score = 0;
    this.members.forEach(function(val,key){
      score += val.getScore();
    });
    return score / this.members.length;
  };
}
