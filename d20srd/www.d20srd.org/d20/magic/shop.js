// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// magic/shop.js
//
// copyright (c) 2012-2013 Douglas Rau
// all rights reserved.

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// configuration

var form_id = 'shop_form';
var rpc_url = '/d20/random/rpc.cgi';
var shop_name;
var keeper_name;

var available = {
       'Thorp': '1d4',
      'Hamlet': '1d6',
     'Village': '2d4',
  'Small Town': '3d4',
  'Large Town': '3d4',
  'Small City': '4d4',
  'Large City': '4d4',
  'Metropolis': '6d4'
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// initialize form

function init_form () {
  client_form(form_id);

  $A($(form_id).elements).each(function (input) {
    input.selectedIndex = rand(input.options.length);
  });
  get_name();
    Event.observe('name','click',get_name);
    Event.observe('town_size','change',get_items);
    Event.observe('shop_type','change',type_reaction);
  get_loc();
    Event.observe('new_loc','click',get_loc);
  get_desc();
    Event.observe('new_desc','click',get_desc);
  get_keeper();
    Event.observe('new_keeper','click',get_keeper);
  get_items();
    Event.observe('new_items','click',get_items);
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// get random name

function get_name () {
  var query = {
    'type':     'Magic Shop Name', 'n': 1,
    'shop_type': $('shop_type').getValue()
  };
  var opts = { 'method': 'get', 'parameters': query,
    'onSuccess': function (req) { recv_name(req); },
    'onFailure': function (req) { name_error(req.statusText); },
    'onException': function (req,err) { name_error('System Error'); }
  };
  new Ajax.Request(rpc_url,opts);
}
function recv_name (req) {
  if (req.responseJSON) {
    list = req.responseJSON;
  } else if (req.responseText) {
    list = req.responseText.evalJSON();
  } else {
    return name_error('No response');
  }
  shop_name = list[0];
  update_name();
}
function name_error (string) {
  $('name').update(string);
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// update name

function update_name () {
  if (shop_name) {
    if (keeper_name) {
      if (/^The /.test(shop_name)) {
        // no keeper name
      } else if (match = /^.+?( and .+'s .+)/.exec(shop_name)) {
        shop_name = keeper_name + match[1];
      } else if (match = /^.+?('s .+)/.exec(shop_name)) {
        shop_name = keeper_name + match[1];
      }
    }
    $('name').update(shop_name);
  }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// type reaction

function type_reaction () {
  get_name(); get_loc(); get_desc(); get_keeper(); get_items();
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// get location

function get_loc () {
  var query = {
    'type':     'Magic Shop Location', 'n': 1,
    'town_size': $('town_size').getValue(),
    'shop_type': $('shop_type').getValue()
  };
  var opts = { 'method': 'get', 'parameters': query,
    'onSuccess': function (req) { recv_loc(req); },
    'onFailure': function (req) { loc_error(req.statusText); },
    'onException': function (req,err) { loc_error('System Error'); }
  };
  new Ajax.Request(rpc_url,opts);
}
function recv_loc (req) {
  if (req.responseJSON) {
    list = req.responseJSON;
  } else if (req.responseText) {
    list = req.responseText.evalJSON();
  } else {
    return loc_error('No response');
  }
  $('location').update(fmt_p(list[0]));
}
function loc_error (text) {
  $('location').update(fmt_p(text));
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// get description

function get_desc () {
  var query = {
    'type':     'Magic Shop Description', 'n': 1,
    'town_size': $('town_size').getValue(),
    'shop_type': $('shop_type').getValue()
  };
  var opts = { 'method': 'get', 'parameters': query,
    'onSuccess': function (req) { recv_desc(req); },
    'onFailure': function (req) { desc_error(req.statusText); },
    'onException': function (req,err) { desc_error('System Error'); }
  };
  new Ajax.Request(rpc_url,opts);
}
function recv_desc (req) {
  if (req.responseJSON) {
    list = req.responseJSON;
  } else if (req.responseText) {
    list = req.responseText.evalJSON();
  } else {
    return desc_error('No response');
  }
  $('description').update(fmt_p(list[0]));
}
function desc_error (text) {
  $('description').update(fmt_p(text));
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// get shopkeeper

function get_keeper () {
  var query = {
    'type':     'Magic Shopkeeper', 'n': 1,
    'shop_type': $('shop_type').getValue()
  };
  var opts = { 'method': 'get', 'parameters': query,
    'onSuccess': function (req) { recv_keeper(req); },
    'onFailure': function (req) { keeper_error(req.statusText); },
    'onException': function (req,err) { keeper_error('System Error'); }
  };
  new Ajax.Request(rpc_url,opts);
}
function recv_keeper (req) {
  if (req.responseJSON) {
    list = req.responseJSON;
  } else if (req.responseText) {
    list = req.responseText.evalJSON();
  } else {
    return keeper_error('No response');
  }
  $('shopkeeper').update(fmt_p(list[0]));
  keeper_name = parse_keeper(list[0]);
  update_name();
}
function keeper_error (text) {
  $('shopkeeper').update(fmt_p(text));
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// parse keeper for name

function parse_keeper (keeper) {
  if (match = /.+? named (.+?)[ ,.]/.exec(keeper)) {
    return match[1];
  }
  return false;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// get items

function get_items () {
  var town_size = $('town_size').getValue();
  var n_items = roll_dice(available[town_size]);

  var query = {
    'type':     'Magic Shop Item', 'n': n_items, 'sort': 1,
    'town_size': town_size,
    'shop_type': $('shop_type').getValue()
  };
  var opts = { 'method': 'get', 'parameters': query,
    'onSuccess': function (req) { recv_items(req); },
    'onFailure': function (req) { items_error(req.statusText); },
    'onException': function (req,err) { items_error('System Error'); }
  };
  new Ajax.Request(rpc_url,opts);
}
function recv_items (req) {
  if (req.responseJSON) {
    list = req.responseJSON;
  } else if (req.responseText) {
    list = req.responseText.evalJSON();
  } else {
    return items_error('No response');
  }
  $('items').update(fmt_ol(list));
}
function items_error (text) {
  $('items').update(fmt_p(text));
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// showtime

document.observe('dom:loaded',init_form);

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
