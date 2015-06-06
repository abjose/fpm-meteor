
Projects = new Mongo.Collection("projects");
Entities= new Mongo.Collection("entities");

if(Meteor.isServer) {
  Meteor.methods({
    // TODO: possible to set Session var here?
    // TODO: make project if nonexistent
    getProjectID: function(title) {
      var project = Projects.find({ title: title });
      if (project.count() == 0) {
	Projects.insert({ title: title });
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
    }
  });  
}
