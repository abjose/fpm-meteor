Meteor.startup(function() {
  Meteor.call("getProjectID", "root", function(error, result){
    Session.set('project_id', result);
  });
  
  Session.set("init_paper", false);
  paper.setup(document.getElementById("canvas"));
  Session.set("initialized", true);  // where's a better place for this?
});

Session.setDefault("initialized", false);  // ...
Session.setDefault("init_paper", false);  // can be set true in startup instead?
Session.setDefault("selected", {});  // TODO: use ReactiveDict?
Session.setDefault("view", {x: 0, y: 0, scale: 1});  // view by center pt
Session.setDefault("screen", {w: 500, h: 500});
Session.setDefault("dragging", false);
Session.setDefault("dragging_entity", false);
Session.setDefault("click_pt", {x: 0, y: 0});
Session.setDefault("drag_pt", {x: 0, y: 0});
Session.setDefault("project_id", undefined);

Router.route('/:project/', function () {
  // Is calling a meteor method here bad practice?
  Meteor.call("getProjectID", this.params.project,  function(error, result){
    Session.set('project_id', result);
  });
  var query = this.params.query;
  console.log('query:', query);
});

// TODO: maybe don't use window-level events.
Meteor.startup(function() {
  window.onmousedown = function(e) {
    Session.set("click_pt", {x: e.clientX, y: e.clientY});
    Session.set("drag_pt", {x: e.clientX, y: e.clientY});
    Session.set("dragging", true);
  }

  window.onmousemove = function(e) {
    Session.set("drag_pt", {x: e.clientX, y: e.clientY});
  }

  window.onmouseup = function() {
    if (Session.get("dragging_entity")) {
      var ids = Object.keys(Session.get("selected"));
      var cp = Session.get('click_pt');
      var dp = Session.get('drag_pt');
      // TODO: think you can do this with one query, with multi: true.
      for (var i = 0; i < ids.length; ++i) {
	// TODO: move position calculation to separate function
	// probably structure things better and have it in a file directly
	// related to entity model
	var res = Entities.update( ids[i],
				  { $inc: { x: dp.x - cp.x, y: dp.y - cp.y }});
      }
    }

    Session.set("dragging", false);
    Session.set("dragging_entity", false);
  }

  window.ondblclick = function(e) {
    var s = 50;
    create_textbox(e.clientX - s/2, e.clientY - s/2, s, s, "test");
  }

  window.onkeypress = function(e) {
    // test view movement
    var view = Session.get('view');
    view.x += 10;
    view.y += 10;
    Session.set('view', view);
  }

  // Update paperjs view based on changes to relevant Session variables.
  Tracker.autorun(function() {
    var view = Session.get('view');
    paper.view.center = view;
    paper.view.zoom = view.scale;
  });
});

Template.fpm.helpers({
  currentProject: function() {
    var project = Projects.find({ _id: Session.get("project_id") });
    if (project.count() == 0) console.log("No currentProject found.");
    if (project.count() > 1) console.log("Multiple current proejcts found...");
    return project;
  }
});

Template.project.helpers({
  entities: function() {
    return Entities.find({ project: this._id });
  },

  refreshPaper: function() {
    console.log('refreshing paper');
    paper.view.draw();
  },
});

Template.entity.helpers({
  branchToEntity: function(rsvp) {
    switch(this.type){
    case 'textbox':   return Template.textbox;
    case 'edge': return Template.edge;
    }
  }
});

Template.textbox.helpers({
  tx: function() {
    // TODO: how to combine tx and ty so only have to do once?
    var screen_pt = WorldToScreen(this);
    if (Session.get("dragging") && Session.get("dragging_entity")) {
      if (Session.get("selected")[this._id]) {
	var cp = Session.get('click_pt');
	var dp = Session.get('drag_pt');
	return screen_pt.x + dp.x - cp.x;
      }
    }
    return screen_pt.x;
  },

  ty: function() {
    var screen_pt = WorldToScreen(this);
    if (Session.get("dragging") && Session.get("dragging_entity")) {
      if (Session.get("selected")[this._id]) {
	var cp = Session.get('click_pt');
	var dp = Session.get('drag_pt');
	return screen_pt.y + dp.y - cp.y;
      }
    }
    return screen_pt.y;
  },

  // TODO: add stuff for width and height
});

Template.textbox.events({
  "mousedown": function(e, template) {
    if (e.which == 1) {  // left click
      Session.set("dragging_entity", true);
      var s = Session.get("selected");
      //s[this._id] = !s[this._id];  // works if undefined
      // ehh
      s = {};
      s[this._id] = true;
      Session.set("selected", s);
    } else if (e.which == 2) {  // center click
      var selected = Object.keys(Session.get("selected"));
      if (selected.length == 1) {
	// Create or destroy edge.
	Meteor.call('setEdge', selected[0], this._id,
		    Session.get("project_id"));
      }
    }
  },
});

Template.edge.helpers({
  draw: function() {
    if (!Session.get("init_paper")) return;
    if (this.paper_edge != undefined) {
      this.paper_edge.remove();
    }
    // get the entities
    // TODO: add some checks...
    var from_entity = Entities.find({ _id: this.from }).fetch()[0];
    var to_entity = Entities.find({ _id: this.to }).fetch()[0];
    var start_pt = {x: from_entity.x + from_entity.w / 2,
		    y: from_entity.y + from_entity.h / 2}
    var end_pt = edge_terminal_pt(from_entity, to_entity);
    this.paper_edge = drawVector(start_pt.x, start_pt.y, end_pt.x, end_pt.y);
  },
});


Template.canv.rendered = function() {
  //paper.setup(document.getElementById("canvas"));
  Session.set("init_paper", true);
};

// TODO: should go in edge model file.
function drawVector(x1, y1, x2, y2) {
  // probably more reactive way to do this...
  var start = new paper.Point(x1, y1);
  var end = new paper.Point(x2, y2);
  var arrowVector = (end.subtract(start)).normalize(10);
  var vector = new paper.Group(
    new paper.Path(start, end),
    new paper.Path(end.add(arrowVector.rotate(135)), end,
		   end.add(arrowVector.rotate(-135))));
  vector.strokeWidth = .9;  // neat, handles values < 1 well
  vector.strokeColor = "#000000";
  paper.view.draw();
  return vector;
}

// TODO: put these in model files when you have those

function create_textbox(x, y, w, h, text) {
  // args should be in screen coords
  var world_pt = ScreenToWorld({x:x, y:y});
  Entities.insert({
    x: world_pt.x, y: world_pt.y,
    w: w * world_pt.scale, h: h * world_pt.scale,
    text: text,
    type: "textbox", project: Session.get("project_id"),
  });
}

// stuff for getting edge point - move to edge model file
function edge_terminal_pt(entity1, entity2) {
  // get centers
  var c1 = {x: entity1.x + entity1.w / 2, y: entity1.y + entity1.h / 2};
  var c2 = {x: entity2.x + entity2.w / 2, y: entity2.y + entity2.h / 2};

  var p1; var p2; var e1; var e2;
  // branch on relative location of centers (reduce to two intersections)
  if (c1.x > c2.x) {
    // intersection might be on right edge of entity2
    e1 = {x: entity2.x + entity2.w, y: entity2.y};
    e2 = {x: entity2.x + entity2.w, y: entity2.y + entity2.h};
    p1 = line_intersection(c1, c2, e1, e2);
  } else {
    // intersection might be on left edge of entity2
    e1 = {x: entity2.x, y: entity2.y};
    e2 = {x: entity2.x, y: entity2.y + entity2.h};
    p1 = line_intersection(c1, c2, e1, e2);
  }
  if (c1.y < c2.y) {
    // intersection might be on top edge of entity2
    e1 = {x: entity2.x, y: entity2.y};
    e2 = {x: entity2.x + entity2.w, y: entity2.y};
    p2 = line_intersection(c1, c2, e1, e2);
  } else {
    // intersection might be on bottom edge of entity2
    e1 = {x: entity2.x, y: entity2.y + entity2.h};
    e2 = {x: entity2.x + entity2.w, y: entity2.y + entity2.h};
    p2 = line_intersection(c1, c2, e1, e2);
  }

  // check to see which possibility is more likely
  var p1_score = ((Math.abs(p1.x - c2.x) - entity2.w/2) +
		  (Math.abs(p1.y - c2.y) - entity2.h/2));
  var p2_score = ((Math.abs(p2.x - c2.x) - entity2.w/2) +
		  (Math.abs(p2.y - c2.y) - entity2.h/2));

  if (p1_score < p2_score) return p1;
  return p2;
}

function line_intersection(a, b, c, d) {
  // According to wikipedia, find the line between a-b and c-d
  // https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
  var numer_x = (a.x*b.y - a.y*b.x) * (c.x - d.x) -
    (a.x - b.x) * (c.x*d.y - c.y*d.x);
  var numer_y = (a.x*b.y - a.y*b.x) * (c.y - d.y) -
    (a.y - b.y) * (c.x*d.y - c.y*d.x);
  var denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denom) < 0.0001) {
    // Approximately horizontal or vertical.
    // Assumes c-d is the entity line...
    return {x: (c.x + d.x) / 2, y: (c.y + d.y) / 2};
  }
  // ... other edge cases
  return {x: numer_x / denom, y: numer_y / denom};
}

function WorldToScreen(world_pt) {
  var view = Session.get('view');
  var screen = Session.get('screen');
  // TODO: probably can reduce this so not explicitly calculating BB
  var world_corner = { x: view.x - (screen.w * view.scale) / 2,
		       y: view.y - (screen.h * view.scale) / 2 };
  return { x: (world_pt.x - world_corner.x) * view.scale,
	   y: (world_pt.y - world_corner.y) * view.scale,
	   scale: view.scale };  // worth returning scale?
}

function ScreenToWorld(screen_pt) {
  var view = Session.get('view');
  var screen = Session.get('screen');
  var inv_scale = 1 / view.scale;
  var world_corner = { x: view.x - (screen.w * view.scale) / 2,
		       y: view.y - (screen.h * view.scale) / 2 };
  return { x: screen_pt.x * inv_scale + world_corner.x,
	   y: screen_pt.y * inv_scale + world_corner.y,
	   scale: inv_scale };
}
