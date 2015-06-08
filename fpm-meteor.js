
Projects = new Mongo.Collection("projects");
Entities= new Mongo.Collection("entities");

if(Meteor.isServer) {
  Meteor.methods({
    getProjectID: function(title) {
      var project = Projects.find({ title: title });
      if (project.count() == 0) {
	Projects.insert({ title: title, tags: {}, });
      }
      return project.fetch()[0]._id;
    },

    setEdge: function(from, to, project) {
      var edge = Entities.find({ type: "edge", project: project,
				 from: from, to: to });
      if (edge.count() != 0) {
	var edge_id = edge.fetch()[0]._id;
	Entities.remove({ _id: edge_id });
      } else {
	Entities.insert({ type: "edge", from: from, to: to, project: project });
      }
    },

    getBackrefs: function(project_id) {
      // Find all project_links that that link to project_id.
      var backrefs = Entities.find({ type: "project_link",
				     target_project: project_id });

      // De-duplicate.
      var seen = {};
      backrefs.forEach(function(entity) {
	seen[entity.project] = true;
      });

      // Return list of {name, id} objects.
      var backref_list = [];
      for (var id in seen) {
	if(seen.hasOwnProperty(id)) {
	  var title = Projects.find({ _id: id }).fetch()[0];
	  if (title) title = title.title;
	  else title = "Error!";
	  backref_list.push({id: id, title: title});
	}
      }

      return backref_list;
    },
  });  
}
