Meteor.startup(function() {
  Meteor.call("getProjectID", "root", function(error, result){
    Session.set('project_id', result);
  });
  
  Session.set("init_paper", false);
  paper.setup(document.getElementById("canvas"));
  Session.set("initialized", true);  // where's a better place for this?
});

Session.setDefault("initialized", false);  // ...
Session.setDefault("init_paper", false);  // set true in startup instead?
Session.setDefault("selected", {});  // TODO: use ReactiveDict?
// TODO: can maybe replace some of the other dragging-related Session vars.
Session.setDefault("dragged_id", undefined);
Session.setDefault("view", {x: 250, y: 250, scale: 1}); // view by center pt
Session.setDefault("initial_view", {}); // lame
Session.setDefault("screen", {w: 500, h: 500});
Session.setDefault("dragging", false);
Session.setDefault("dragging_entity", false);
Session.setDefault("click_pt", {x: 0, y: 0});
Session.setDefault("drag_pt", {x: 0, y: 0});
Session.setDefault("project_id", undefined);
Session.setDefault("tool", "text");
Session.setDefault("drawing", false);

Router.route("/:project/", function () {
  // Is calling a meteor method here bad practice?
  Meteor.call("getProjectID", this.params.project,  function(error, result) {
    if (error) console.log("Error routing to project.");
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
    // Also I don't think e.which works this way.
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

    if (Session.get("dragging") && !Session.get("dragging_entity")
        && Session.get("tool") != "curve") {
      var cp = Session.get('click_pt');
      var view = Session.get("initial_view");
      view.x -= world_pt.x - cp.x;
      view.y -= world_pt.y - cp.y;
      Session.set("view", view);
    }
  }

  window.onmouseup = function() {
    if (Session.get("dragging_entity")) {
      var cp = Session.get('click_pt');
      var dp = Session.get('drag_pt');
      var res = Entities.update( Session.get("dragged_id"),
				 { $inc: { x: dp.x - cp.x, y: dp.y - cp.y }});
    }

    Session.set("dragging", false);
    Session.set("dragging_entity", false);
  }

  window.onkeydown = function(e) {
    // If backspace or delete, remove selected path.
    var tool = Session.get("tool");
    if (path && (tool == "curve" || tool == "line") &&
	(e.keyCode == 8 || e.keyCode == 46)) {
      Entities.remove(path.data._id);
      path.remove();
      path = undefined;
    }
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

Template.projectArea.helpers({
  currentProject: function() {
    var project = Projects.find({ _id: Session.get("project_id") });
    if (project.count() == 0) console.log("No currentProject found.");
    if (project.count() > 1) console.log("Multiple current projects found...");
    return project;
  },
});

// TODO: would prefer not to have global path like this.
var path, segment;

// Options for paper.project.hitTest.
// TODO: Move elsewhere.
var hitOptions = {
  segments: true,
  stroke: true,
  tolerance: 5,
};

Template.projectArea.events({
  "dblclick": function(e, template) {
    var world_pt = ScreenToWorld({x: e.clientX, y: e.clientY});
    switch (Session.get("tool")) {
    case "text":
      create_textbox(world_pt.x, world_pt.y, 50, 50, "insert text");
      break;
    case "project":
      create_project_link(world_pt.x, world_pt.y, "null");
      break;
    case "edge":
      break;
    case "curve":
      break;
    default:
      console.log("Tool not found:", Session.get("tool"));
      break;
    }
  },

  "mousedown": function(e, template) {
    // Handle drawing-related stuff.
    // TODO: move this elsewhere.
    if (Session.get("tool") == "curve") {
      var world_pt = ScreenToWorld({x: e.clientX, y: e.clientY});
      var hitResult = paper.project.hitTest(world_pt, hitOptions);
      if (!hitResult) {
	Session.set("drawing", true);
	path = new paper.Path({
          segments: [world_pt],
          strokeColor: 'black',
	});
      } else {
	// Got a hitResult. 
	path = hitResult.item;
	path.selected = true;
	if (hitResult.type == 'segment') {
	  segment = hitResult.segment;
	} else if (hitResult.type == 'stroke') {
	  var location = hitResult.location;
	  segment = path.insert(location.index + 1, world_pt);
	  path.smooth();
	}
      }
    }
  },

  "mousemove": function(e, template) {
    if (Session.get("drawing") && path) {
      var world_pt = ScreenToWorld({x: e.clientX, y: e.clientY});
      path.add(world_pt);
    } else if (Session.get("tool") == "curve" && Session.get("dragging")) {
      var dp = Session.get('drag_pt');
      if (segment) {
	segment.point = dp;
	path.smooth();
      } else if (path) {
	path.position = dp;
      }
    }
  },
  
  "mouseup": function(e, template) {
    if (Session.get("drawing") && path != undefined) {
      path.simplify();
      create_path(path.pathData);
      path.remove();
      // NOTE: "drawing" session variable is cleared in document event handler,
      // just in case mouse out of project area.
      // TODO: consider moving all of this there, as path isn't persisted when
      // mouseup elsewhere.
    }
  },
});

Template.projectInfo.created = function() {
  var self = this;
  self.backref_list = new ReactiveVar([]);
  self.project_title = new ReactiveVar("");
  self.project_tags = new ReactiveVar({});
  
  Tracker.autorun(function() {
    Meteor.call("getBackrefs", Session.get("project_id"), function(err, refs) {
      // TODO: need to make this react to changes to project_links subset of
      // entities.
      if (err) console.log(err);
      else self.backref_list.set(refs);
    });
  });

  Tracker.autorun(function() {
    var project = Session.get("project_id");
    var project = Projects.find({ _id: project }).fetch();
    if (project.length > 0) {
      self.project_title.set(project[0].title);
    }
  });
  // TODO: don't repeat yourself
  Tracker.autorun(function() {
    var project = Session.get("project_id");
    var project = Projects.find({ _id: project }).fetch();
    if (project.length > 0) {
      self.project_tags.set(project[0].tags);
    }
  });
}

Template.projectInfo.helpers({
  projectTitle: function() {
    // TODO: more reasonable to just do this in data context of project object
    return Template.instance().project_title.get();
  },
  
  tags: function() {
    // Parse tags object into list of {key:..., value:...} objects.
    // TODO: Would be nice if didn't have to do this.
    var tags = Template.instance().project_tags.get();
    var keys = Object.keys(tags);
    var tag_list = [];
    for (var i = 0; i < keys.length; ++i) {
      var key = keys[i];
      var value = tags[key] || "";
      tag_list.push({key: key, value: value});
    }
    return tag_list;
  },

  backrefs: function() {
    return Template.instance().backref_list.get();
  }
});

Template.tag.helpers({
  hasValue: function() {
    return this.value != null && this.value != "";
  },
});

Template.tag.events({
  "dblclick": function(e, template) {
    // TODO: make this less ugly and don't repeat yourself.
    var pid = Session.get("project_id");
    if (pid == undefined) return;
    var project = Projects.find({ _id: pid }).fetch();
    if (project.length == 0) return;
    project = project[0];
    var tags = project.tags;

    // Prompt for key and value
    var key = prompt("key", this.key);
    var value = prompt("value", this.value);
    if (value == "") value = null;

    // Update tags.
    delete tags[this.key];
    if (key != "") tags[key] = value;
    Projects.update(pid, { $set: { tags: tags }});
    return false;
  },
});

Template.add_tag.events({
  "dblclick": function(e, template) {
    // TODO: make this less ugly.
    var pid = Session.get("project_id");
    if (pid == undefined) return;
    var project = Projects.find({ _id: pid }).fetch();
    if (project.length == 0) return;
    project = project[0];
    var tags = project.tags;
    tags['newtag'] = null;
    Projects.update(pid, { $set: { tags: tags }});
    return false;
  },
});

Template.toolbar.helpers({
  tools: function() {
    return [{name: "text"}, {name: "project"}, {name: "edge"},
	    {name: "curve"}];
  },
  
});

Template.toolbarItem.helpers({
  isSelected: function() {
    return Session.get("tool") == this.name;
  },
});

Template.toolbarItem.events({
  "click": function(e, template) {
    Session.set("tool", template.data.name);
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
    case "textbox":   return Template.textbox;
    case "edge": return Template.edge;
    case "project_link": return Template.project_link;
    case "path": return Template.path;
    }
  },

  position: function() {
    var screen_pt;
    if (Session.get("dragging") && Session.get("dragging_entity")
	&& Session.get("dragged_id") == this._id) {
      var cp = Session.get("click_pt");
      var dp = Session.get("drag_pt");
      screen_pt = WorldToScreen({x: this.x + dp.x - cp.x,
				 y: this.y + dp.y - cp.y});
    } else {
      screen_pt = WorldToScreen(this);
    }
    return "top:" + screen_pt.y + "px; left:" + screen_pt.x + "px;";
  },

  scale: function() {
    var view = Session.get("view");
    return view.scale;
  },

  selected: function() {
    return this._id in Session.get("selected");
  },
});

Template.entity.events({
  "click": function(e, template) {
    if (e.which == 1) {
      if (Session.get("tool") == "edge") {
	var selected = Object.keys(Session.get("selected"));
	// TODO: allow self-edges, draw nicely.
	if (selected.length > 0 && selected[0] != this._id) {
	  // Create or destroy edge.
	  Meteor.call("setEdge", selected[0], this._id,
		      Session.get("project_id"));
	  Session.set("selected", {});
	  return;
	}
	// Set this entity as being selected.
	// TODO: Better selections.
	s = {};
	s[this._id] = true;
	Session.set("selected", s);
      }
    }
  },

  "mousedown": function(e, template) {
    if (e.ctrlKey) {
      Session.set("dragging_entity", true);
      Session.set("dragged_id", this._id);
    } else {
      // Prevent dragging during text edits,
      // unless we're trying to drag the entity.
      e.stopPropagation();
    }
  },
});

Template.textbox.inheritsHelpersFrom("entity");

Template.textbox.events({
  "mouseup": function(e, template) {
    var w = e.target.style.width;
    var h = e.target.style.height;
    var update = {};
    if (w != "") update["w"] = parseInt(w);
    if (h != "") update["h"] = parseInt(h);
    Entities.update(this._id, { $set: update });
  },

  "wheel": function(e, template) {
    // Only prevent zooming if the textbox has a visible scrollbar.
    if (e.target.scrollHeight > e.target.clientHeight) {
      e.stopPropagation();
    }
  },

  "blur": function(e, template) {
    if (e.target.value == "") {
      Entities.remove(this._id);
    } else {
      Entities.update(this._id, { $set: { text: e.target.value }});
    }
  },

  "dblclick": function(e, template) {
    e.stopPropagation();
  },
});

Template.project_link.inheritsHelpersFrom("entity");
Template.project_link.helpers({
  project_name: function() {
    // parse out project name to display as link text
    // TODO: don't repeat yourself
    var a = document.createElement("a");
    a.href = this.project_link;
    return a.pathname.slice(1, a.pathname.length);
  }
});

Template.project_link.events({
  "dblclick": function(e, template) {
    e.stopPropagation();
    var url = prompt("url", this.project_link);
    if (url == "") {
      Entities.remove(this._id);
    } else if (url != null) {
      var a = document.createElement("a");
      a.href = url;
      var target_project_name = a.pathname.slice(1, a.pathname.length);
      var self = this;
      Meteor.call("getProjectID", target_project_name, function(error, result) {
        if (error) console.log("Error updating project link.");
        Entities.update(self._id, { $set: { project_link: url,
					    target_project: result }});
      });
    }
  },

  // Don't repeat yourself.
  "mouseup": function(e, template) {
    var w = e.target.style.width;
    var h = e.target.style.height;
    var update = {};
    if (w != "") update["w"] = parseInt(w);
    if (h != "") update["h"] = parseInt(h);
    Entities.update(this._id, { $set: update });
  },

});

Template.edge.helpers({
  draw: function() {
    if (!Session.get("init_paper")) return;
    // TODO: not sure setting edge like this makes sense?
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
    if (end_pt != undefined) {
      this.paper_edge = drawVector(start_pt.x, start_pt.y, end_pt.x, end_pt.y);
    }
  },
});

Template.path.helpers({
  draw: function() {
    if (!Session.get("init_paper")) return;
    var foo = new paper.Path(this.pathData);
    foo.strokeColor = "black";
    foo.data._id = this._id;
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

function create_project_link(x, y, link) {
  // args should be in world coords
  Entities.insert({
    x: x, y: y, w:40, h:20, project_link: link, target_project: null,
    type: "project_link", project: Session.get("project_id"),
  });
}

function create_path(pathData) {
  Entities.insert({
    pathData: pathData,
    type: "path", project: Session.get("project_id"),
  });
}

// stuff for getting edge point - move to edge model file
function edge_terminal_pt(entity1, entity2) {
  // get centers
  if (entity1 == undefined || entity2 == undefined) return;
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
  if (view == undefined) view = Session.get("view");
  var screen = Session.get("screen");
  // TODO: probably can reduce this so not explicitly calculating BB
  var view_corner = { x: view.x - (screen.w / view.scale) / 2,
		      y: view.y - (screen.h / view.scale) / 2 };
  return { x: (world_pt.x - view_corner.x) * view.scale,
  	   y: (world_pt.y - view_corner.y) * view.scale,
  	   scale: view.scale };  // worth returning scale?
}

function ScreenToWorld(screen_pt, view) {
  if (view == undefined) view = Session.get("view");
  var screen = Session.get("screen");
  // Get bounding box of project area to adjust for any offset in the document.
  // Note that this step isn't required in WorldToScreen, as here screen_pt
  // is relative to the document, whereas there it's relative to project_area.
  var bb = document.getElementById("project_area").getBoundingClientRect();
  var view_corner = { x: view.x - (screen.w / view.scale) / 2,
		      y: view.y - (screen.h / view.scale) / 2 };
  return { x: (screen_pt.x - bb.left) / view.scale + view_corner.x,
	   y: (screen_pt.y - bb.top)  / view.scale + view_corner.y,
	   scale: view.scale };
}
