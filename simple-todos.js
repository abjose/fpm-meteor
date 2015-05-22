
Projects = new Mongo.Collection("projects");
Entities= new Mongo.Collection("entities");

if(Meteor.isServer) {
  Meteor.methods({
    getRoot: function() {
      var root = Projects.find({ title: "root" });
      if (root.count() == 0) console.log("NO ROOT FOUND!");
      return root.fetch()[0]._id;
    }
  });  
}
