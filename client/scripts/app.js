//Client
var ws = new WebSocket('ws://buddyqueue.com/:80', 'echo-protocol');

// var gameTypes = {
//     "smite": ["arena", "joust", "conquest", "motd", "siege"] //We can add this later, otherwise we'll be dividing our userbase too small at the start.
// }

var numInParty = 0;

var partyMembers = [];

var chatBloop = new Audio('client/sounds/chatnotification.ogg');

ws.onmessage = function(e) {
    var data = JSON.parse(e.data);
    if (data.type.endsWith("Request")) {
        requestHandles[data.type](data);
    }
    else {
        responseHandles[data.type](data);
    }
};

var responseHandles = {
    htmlResponse: function(data) {
        renderNewPage(data.page, data.route);
    },
    searchResponse: function(data) {

        if (data.error) {
            error(data.error);
        }
        else {

            wsSend(constructRequest("html", {
                route: "party", size: numInParty
            }));
        }
    },
    partyResponse: function(data) {
        //Had to write for loops here instead of forEach because of Aynsc callback timings.
        var newPartyMembers = partyMembers;
        for (var i = 0; i < partyMembers.length; i++) { //Checks for old users to be removed
            var partyMem = partyMembers[i];
            var hit = false;
            for (var mem in data.members) {
                if (data.members[mem].name == partyMem)
                    hit = true;
            }
            if (!hit) {
                newPartyMembers.splice(i, 1);
                //$('#' + (i + 1)).empty();
                shiftParty(i + 1, partyMem);
                console.log("killing", i + 1, partyMem);
                console.log(newPartyMembers, 'Current Members');
            }
        }
        partyMembers = newPartyMembers;

        for (i = 0; i < data.members.length; i++) { //Checks for new users to be added
            var member = data.members[i];
            if (partyMembers.indexOf(member.name) == -1 || (member.name == 'fake' && partyMembers.length < numInParty)) {
                renderNewPage(member, 'partyMember');
            }
        }
        $('.player').off();
        events('partyMember');
    },
    sendMessageResponse: function(data) {
        var date = new Date();
        function structureDate() {
            var hours = date.getHours() % 12;
            if (hours === 0) hours = 12;
            var minutes = date.getMinutes();
            var suffix = 'AM'
            if (date.getHours() > 11) suffix = 'PM';
            else if (date.getHours() == 24) suffix = 'AM';
            return hours + ":" + (minutes < 10 ? '0' + minutes : minutes) + ' ' + suffix;
        }
        structureDate()
        $("#chat").append(data.message.replace("{{date}}", structureDate()));
        var position = $(".message").last().position();
        $('#chat').scrollTop($("#chat").scrollTop()+position.top);
        chatBloop.play();
    }
};

function shiftParty (index, mem) {
    for (var i = index; i < numInParty; i++) {
        $('#' + i).empty().show();
        var shit = $('#' + (i + 1)).children()
        $('#' + i).append(shit).show();
    }
}

var requestHandles = {
    removePartyMemberRequest: function(data) {
        console.log("im useless :(")
    }
};

function constructRequest(type, options) {
    var req = {
        type: type + "Request"
    };
    for (var key in options) {
        req[key] = options[key];
    }
    return req;
}

function constructReponse(type, options) {
    var req = {
        type: type + "Response"
    };
    for (var key in options) {
        req[key] = options[key];
    }
    return req;
}


function wsSend(data) {
    ws.send(JSON.stringify(data));
}


function renderNewPage(page, route) {
    if (route == 'partyMember') {
        generatePlayer(page);
    }
    else {
        if (route == "party"){
            $('#home').animate({
                paddingTop: 0,
                opacity: 0,
                height: 0
            },1000,function(){
               $('#home').remove();
                events(route);
            });
            $("#container").append(page);
        } else if (route == "home" && $("#party")[0]){
            $("#container").children().css("margin-top","0px").animate({
                top: $(this).offset()+window.height,
                opacity: 0
            },1000,function(){
                $(this).remove();
            });
            $("#container").prepend(page);
            events(route);
            var topPad = $("#home").css("padding-top"), height = $("#home").css("height");
            $("#home").css("padding-top","0px").css("height","0px");
            $("#home").animate({
                paddingTop: topPad,
                height: height
            },1000);
        }
        else {
            $('#container').append(page);
            events(route);
        }
    }
}

ws.onopen = function() {
    wsSend(constructRequest("html", {
        route: "home"
    }));
    slider();
};

function events(route) {
    $(window).resize(function(){
        $(".slider").css("width","100%").css("height","100%");
        $("#sliderImages li img").each(function(){
            $(this).width(window.width);
            $(this).height(window.height);
        });
    });
    this.home = function() {

       $('html').mousewheel(function(ev,delta){
           ev.preventDefault();
            $('#chat').scrollTop($('#chat').scrollTop()+1*-delta);
        });
        $('#option-game li').on('click', function() {
            $('#game').text($(this).attr('data-type'));
            if ($(this).attr("data-type").toLowerCase() === "lol") {
                $("#region-lol").show();
            }
            else {
                $("#region-lol").hide();
            }
        });

        $('#option-partyCount li').on('click', function() {
            $('#partyCount').text($(this).attr('data-count'));
        });

        $('#option-regionLol li').on('click', function() {
            $('#regionLol').text($(this).attr('data-type'));
        });

        $("#region-lol").hide();

        $(".alert").css("display", "none");
        $('#submitSearch').on('click', function(e) {
            console.log("CLICKED!");
            sendSearch(e);
        });

        function sendSearch(e) {
            //Lol is very loose on their names...
            if (!(/\s+/.exec($('#searchEntry').prop('value')))) {
            //    if ($('#searchEntry').prop('value').length > 6) {
            var values = {};
            numInParty = parseInt($("#partyCount").html());
            $('#game, #searchEntry, #partyCount, #regionLol').each(function() { //Option values
                values[$(this).prop('id')] = $(this).prop('value') ? $(this).prop('value') : $(this).html();
            }).get();
            console.log(values);
            wsSend(constructRequest("search", values));
            $("#submitSearch").old = $("#submitSearch").html();
            $("#submitSearch").html("<img src='client/images/loading.gif' width=30 height=30 style='position:relative;top:0px;left:0px;'></img>");
            } else {
                error("Username does not exist");
            }
        }

        $("#searchEntry").click(function() {
            $(".alert").fadeOut("fast", function() {
                $(".alert").css("display", "hidden");
            });
        });
        $('#searchEntry').on("keypress",function(e){
            //$('body').on('keypress', function(e) {
                if (e.keyCode == '13') {
                    e.preventDefault();
                    sendSearch(e);
                }
          //  });
        });

        $('#searchEntry').focusout(function() {
            $('body').off('keypress');
        });


    };
    this.partyMember = function() {
        //console.log(""+((1 / numInParty)*100.0)+"%");
        $(".slot").css("width",""+((1 / numInParty)*100.0)+"%");
        $('.player').on('click', function(e) {
            console.log('clicked!');

        });

        var oldcolor = ''; var oldborder = '';
        $('.player').hover(function() {
            oldcolor = $(this).children('.slot-username').css('color');
            oldborder = $(this).children('.slot-avatar').css('border');
            $(this).children('.slot-username').css('color', 'rgb(80, 204, 250)');
            $(this).children('.slot-avatar').css('border-width', '0');
            $(this).children('.slot-avatar').css('border', '2px solid rgb(80, 204, 250)');
            $(this).children('.stat-dropdown').stop(true).show(400);
        }, function() {
            $(this).children('.slot-username').css('color', oldcolor);
            $(this).children('.slot-avatar').css('border-width', '0');
            $(this).children('.slot-avatar').css('border', oldborder);
            $(this).children('.stat-dropdown').stop(true).hide(400);
        });

    };
    this.party = function() {
            $(".slot").css("width",""+((1 / numInParty)*100.0)+"%");
            function sendMessage() {
            wsSend(constructRequest("sendMessage", {
                message: $("#messageText").prop("value")
            }));
            $("#messageText").prop("value", "");

        }

        $("#sendMessage").click(function() {
            sendMessage();
        });

        $('#messageText').on("keypress",function(e) {
          //  $('body').on('keypress', function(e) {
                if (e.keyCode == '13') {
                    if ($("#messageText").prop("value") === '') return;
                    e.preventDefault();
                    sendMessage();
                }
         //   });
        });

        $("#chat").scroll(function(){
            //  -webkit-mask-image: -webkit-gradient(linear, left bottom, left top, color-stop(70%,rgba(0,0,0,1)), color-stop(99%,rgba(0,0,0,0)));
            if ($("#chat").scrollTop() != 0){
                $("#chat").css("-webkit-mask-image", "-webkit-gradient(linear, left bottom, left top, color-stop(70%,rgba(0,0,0,1)), color-stop(99%,rgba(0,0,0,0)))");
            } else {
                $("#chat").css("-webkit-mask-image","");
            }
        });

         $("#newsearch").click(function(){
             wsSend(constructRequest("html",{route:"home"}));
             partyMembers = [];
             numInParty = 0;
         });
    };
    this[route]();
}

function generatePlayer(member) {
    var page = $(member.template)
    var id = partyMembers.length + 1;
    var fake = partyMembers.indexOf('fake');
    if (fake != -1 && member.name != 'fake') {
        partyMembers.splice(fake, 1, member.name);
        console.log(partyMembers, 'replaced a fake at', fake);
        id = fake + 1;
    } else {
        partyMembers.push(member.name);
    }
    console.log(id, member.name, 'ID!');
    $('#' + id).empty();
    if (member.name == 'fake') {
        $('#' + id).append(member.template).show();
    } else {
        $('#' + id).append(member.template).hide().fadeIn();
    }
}

function error(error) {
    $(".alert").fadeIn("fast", function() {
        $(".alert").css("display", "block");
    });
    //$(".alert").css("display","block");
    $("#error").html(error);
    $("#submitSearch").html("<i class='fa fa-search'></i> <span class='option'>Search</span>");
    setTimeout(function() {
        $('.alert').fadeOut();
    },2000);
}


function slider() {
    var slideCount = $('.slider ul li').length;
    var slideWidth = window.innerWidth;
    var slideHeight = window.innerHeight;
    var sliderUlWidth = slideCount * slideWidth;

    $('.background').css('width', "100vw");
    $('.background').css('height', "100vh");

    $('.slider').css({
        width: slideWidth,
        height: slideHeight
    });

    $('.slider ul').css({
        width: sliderUlWidth
    });

    $('.slider ul li:last-child').prependTo('.slider ul');

    function moveRight() {
        $('.slider ul').animate({
            left: -slideWidth
        }, 1000, function() {
            $('.slider ul li:first-child').appendTo('.slider ul');
            $('.slider ul').css('left', '');
        });

    };
    setInterval(function() {
        moveRight();
    }, 5000);
}
