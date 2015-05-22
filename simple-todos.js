
Projects = new Mongo.Collection("projects");
Entities= new Mongo.Collection("entities");

if(Meteor.isServer) {
  Meteor.methods({
    getRoot: function() {
      var root = Projects.find({ title: "root" });
      if (root.count() == 0) console.log("NO ROOT FOUND!");
      return root.fetch()[0]._id;
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
