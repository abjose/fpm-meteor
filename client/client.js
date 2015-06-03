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
Session.setDefault("view", {x: 250, y: 250, scale: 1}); // view by center pt
Session.setDefault("initial_view", {}); // lame
Session.setDefault("screen", {w: 500, h: 500});
Session.setDefault("dragging", false);
Session.setDefault("dragging_entity", false);
Session.setDefault("click_pt", {x: 0, y: 0});
Session.setDefault("drag_pt", {x: 0, y: 0});
Session.setDefault("project_id", undefined);

Router.route("/:project/", function () {
  // Is calling a meteor method here bad practice?
  Meteor.call("getProjectID", this.params.project,  function(error, result){
    Session.set("project_id", result);
  });
  var query = this.params.query;
  if ("x" in query && "y" in query) {
    var view = {x: query["x"], y: query["y"], scale: 1}
    if ("scale" in query) view["scale"] = query["scale"];
    Session.set("view", view);
  }
});

// Update URL to reflect View parameters.
// TODO: this is a bit hacky.
Tracker.autorun(function() {
  var route = Router.current();
  if (route == null) return;
  var view = Session.get('view');
  var project = route.params.project;
  var url = '/'+project+'?x='+view.x+'&y='+view.y+'&scale='+view.scale;
  Router.go(url);
});

// TODO: maybe don't use window-level events.
Meteor.startup(function() {
  window.onmousedown = function(e) {
    // Conditionally clear selection if clicked canvas or background
    // TODO: a bit simplistic
    if (e.which == 1) {
      var name = e.target.localName;
      if (name == "body" || name == "canvas") {
	Session.set("selected", {});
      }
    }

    // TODO: consider finding better place to do this transform
    // currently have to convert back to screen coords in textbox helper
    var world_pt = ScreenToWorld({x: e.clientX, y: e.clientY});
    Session.set("click_pt", {x: world_pt.x, y: world_pt.y});
    Session.set("drag_pt", {x: world_pt.x, y: world_pt.y});
    Session.set("initial_view", Session.get("view"));
    Session.set("dragging", true);
  }

  window.onmousemove = function(e) {
    var world_pt;
    // TODO: clean this up...
    if (Session.get("dragging") && !Session.get("dragging_entity")) {
      world_pt = ScreenToWorld({x: e.clientX, y: e.clientY},
			       Session.get("initial_view"));
    } else {
      world_pt = ScreenToWorld({x: e.clientX, y: e.clientY});
    }
    Session.set("drag_pt", {x: world_pt.x, y: world_pt.y});

    if (Session.get("dragging") && !Session.get("dragging_entity")) {
      var cp = Session.get('click_pt');
      var view = Session.get("initial_view");
      view.x -= world_pt.x - cp.x;
      view.y -= world_pt.y - cp.y;
      Session.set("view", view);
    }
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
    //var world_pt = ScreenToWorld({x: e.clientX, y: e.clientY});
    //create_textbox(world_pt.x, world_pt.y, 50, 50, "test");
  }

  document.addEventListener('wheel', function(e) {
    var view = Session.get("view");
    if (e.deltaY > 0) {
      view.scale *= 0.9;
    } else {
      view.scale *= 1.1;
    }
    Session.set("view", view);
  }, false);

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
    // if (project.count() == 0) console.log("No currentProject found.");
    if (project.count() > 1) console.log("Multiple current projects found...");
    return project;
  },
});

Template.projectInfo.helpers({
  projectTitle: function() {
    return "project title";
  },
  
  tags: function() {
    // for tags could just have title value pair but value is undefined?
    return [{title: 'tag1'}, {title: 'tag2'}, {title: 'tag3'}, {title: '+'}];
  },

  attributes: function() {
    // better name? why not just mix with tags?
    return {attr1: 5, attr2:0.1, animalsound: 'woof'};
  },  
});

Template.toolbar.helpers({
  tools: function() {
    return [{name: "tool1"}, {name: "tool2"}, {name: "tool3"}];
  },
  
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

Template.textbox.created = function() {
  //this.edit_mode = new ReactiveVar(false);
}

Template.textbox.helpers({
  scale: function() {
    var view = Session.get("view");
    return view.scale;
  },

  tx: function() {
    // TODO: how to combine tx and ty so only have to do once?
    var screen_pt;
    //var editing = Template.instance().edit_mode.get();
    if (Session.get("dragging") && Session.get("dragging_entity")
	&& this._id in Session.get("selected")) {
      var cp = Session.get('click_pt');
      var dp = Session.get('drag_pt');
      screen_pt = WorldToScreen({x: this.x + dp.x - cp.x,
				 y: this.y + dp.y - cp.y});
    } else {
      screen_pt = WorldToScreen(this);
    }
    return screen_pt.x;
  },

  ty: function() {
    var screen_pt;
    //var editing = Template.instance().edit_mode.get();
    if (Session.get("dragging") && Session.get("dragging_entity")
	&& this._id in Session.get("selected")) {
      var cp = Session.get('click_pt');
      var dp = Session.get('drag_pt');
      screen_pt = WorldToScreen({x: this.x + dp.x - cp.x,
				 y: this.y + dp.y - cp.y});
    } else {
      screen_pt = WorldToScreen(this);
    }
    return screen_pt.y;
  },

  selected: function() {
    return this._id in Session.get("selected");
  },
});

Template.textbox.events({
  "mousedown": function(e, template) {
    if (!e.ctrlKey) {
      // Keep from dragging world when editing textbox.
      // But don't if we're trying to drag the textbox.
      e.stopPropagation();
    }
    
    if (e.which == 1 && e.ctrlKey) {  // left click
      Session.set("dragging_entity", true);
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

  "mouseup": function(e, template) {
    Entities.update( this._id, { $set: { w: e.target.style.width,
					 h: e.target.style.height, }});
  },

  "wheel": function(e, template) {
    // Only prevent zooming if the textbox has a visible scrollbar.
    if (e.target.scrollHeight > e.target.clientHeight) {
      e.stopPropagation();
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
		    y: from_entity.y + from_entity.h / 2};
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
  // args should be in world coords
  Entities.insert({
    x: x - w/2, y: y - h/2, w: w, h: h, text: text,
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

function WorldToScreen(world_pt, view) {
  if (view == undefined) view = Session.get('view');
  var screen = Session.get('screen');
  // TODO: probably can reduce this so not explicitly calculating BB
  var view_corner = { x: view.x - (screen.w / view.scale) / 2,
		      y: view.y - (screen.h / view.scale) / 2 };
  return { x: (world_pt.x - view_corner.x) * view.scale,
  	   y: (world_pt.y - view_corner.y) * view.scale,
  	   scale: view.scale };  // worth returning scale?
}

function ScreenToWorld(screen_pt, view) {
  if (view == undefined) view = Session.get('view');
  var screen = Session.get('screen');
  var view_corner = { x: view.x - (screen.w / view.scale) / 2,
		      y: view.y - (screen.h / view.scale) / 2 };
  return { x: screen_pt.x / view.scale + view_corner.x,
	   y: screen_pt.y / view.scale + view_corner.y,
	   scale: view.scale };
}
