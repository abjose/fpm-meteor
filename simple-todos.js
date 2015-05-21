
Projects = new Mongo.Collection("projects");
Entities= new Mongo.Collection("entities");

if (Meteor.isServer) {
  Meteor.startup(function () {
    // code to run on server at startup
  });
}
