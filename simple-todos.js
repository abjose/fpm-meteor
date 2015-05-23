
Projects = new Mongo.Collection("projects");
Entities= new Mongo.Collection("entities");

if(Meteor.isServer) {
  Meteor.methods({
    // TODO: possible to set Session var here?
    // TODO: make project if nonexistent
    getProjectID: function(title) {
      var project = Projects.find({ title: title });
      if (project.count() == 0) console.log("PROJECT NOT FOUND!");
      return project.fetch()[0]._id;
    },

    setEdge: function(from, to, project) {
      var edge = Entities.find({ type: "edge", project: project,
				 from: from, to: to });
      console.log("in setEdge");
      if (edge.count() != 0) {
	// TODO: possible to remove given document instead of finding again?
	Entities.remove({ type: "edge", from: from, to: to, project: project });
      } else {
	Entities.insert({ type: "edge", from: from, to: to, project: project });
      }
    }
  });  
}
