var _ = require('lodash');
var inherits = require('inherits');
var Transform = require('stream').Transform;

function Unique(options) {
  Transform.call(this, {objectMode: true});

  this.serializer = options.serializer;

  this.cache = [];
}

inherits(Unique, Transform);

function serComparator(ser) {
  return ser.indicies[0];
}

function createSer(option, serialized) {
  return {
    serialization: serialized,
    indicies: [option.id],
    data: [option.data]
  };
}

function mergeCommands(commands1, commands2) {
  if (commands1.delete &&
    commands2.insert &&
    commands1.delete.id === commands2.insert.id) {
      delete commands1.delete;
      commands1.update = commands2.insert;
      delete commands2.insert;

      //if we do the merge, and commands1 did an insert, it inserted thinking
      //that commands1.delete.id had been deleted. Thus, if commands1.insert.id
      //is greater than or equal to commands1.delete.id (before the delete)
      //we need to make a slight adjustment
      if (commands1.insert && commands1.insert.id >= commands1.update.id) {
        commands1.insert.id++;
      }
  }
  return _.merge(commands1, commands2);
}

Unique.prototype.triggerinsert = function(id, data) {
  var result = {
    event: 'insert',
    id: id,
    data: data
  };
  this.push(result);
};

Unique.prototype.triggerupdate = function(id, data) {
  var result = {
    event: 'update',
    id: id,
    data: data
  };
  this.push(result);
};

Unique.prototype.triggerdelete = function(id, dummy) {
  var result = {
    event: 'delete',
    id: id,
  };
  this.push(result);
};

Unique.prototype.trigger = function (obj) {
  var events = ['update', 'delete', 'insert'];
  var event, command;
  for (var i = 0; i < 3; i++) {
    event = events[i];
    command = obj[event];
    if (typeof command !== 'undefined') {
      this['trigger' + event](command.id, command.data);
    }
  }
}

Unique.prototype.createNewSer = function (option, serialized) {
  // create a new ser, indicies: [id]
  newSer = createSer(option, serialized);

  // insert it into index at the correct location
  newSerIndex = _.sortedIndex(this.cache, newSer, serComparator);
  this.cache.splice(newSerIndex, 0, newSer);

  return {insert: {id: newSerIndex, data: option.data}};
};

Unique.prototype.addToExistingSer = function(serIndex, option) {
  var newSer, newSerIndex, newSubIndex;
  var commands = {};

  // splice out the existing ser
  newSer = this.cache.splice(serIndex, 1)[0];

  // insert the index sorted into indicies and data
  newSubIndex = _.sortedIndex(newSer.indicies, option.id);
  newSer.indicies.splice(newSubIndex, 0, option.id);
  newSer.data.splice(newSubIndex, 0, option.data);

  // insert it into the main index
  newSerIndex = _.sortedIndex(this.cache, newSer, serComparator);
  this.cache.splice(newSerIndex, 0, newSer);

  // if it was inserted at pos 0
  if (newSubIndex === 0) {
    commands.delete = {id: serIndex};
    commands.insert = {id: newSerIndex, data: option.data};
  }

  return commands;
};

Unique.prototype.deleteSer = function (serIndex) {
  this.cache.splice(serIndex, 1);

  return {delete: {id: serIndex}};
}

Unique.prototype.removeFromExistingSer = function (serIndex, option) {
  var newSer;
  var newSerIndex;
  var subIndex;
  var commands = {};

  //if this is the last item in the ser
  if (this.cache[serIndex].indicies.length === 1)  {
    commands = this.deleteSer(serIndex);

  //else
  } else {

    //splice out the old ser
    newSer = this.cache.splice(serIndex, 1)[0];

    //remove id and data from the old ser
    subIndex = newSer.indicies.indexOf(option.id);
    newSer.indicies.splice(subIndex, 1);
    newSer.data.splice(subIndex, 1);

    //insert it into the main index
    newSerIndex = _.sortedIndex(this.cache, newSer, serComparator);
    this.cache.splice(newSerIndex, 0, newSer);

    //if the old item was pos 0 in the old ser
    if (subIndex === 0) {
      commands.delete = {id: serIndex};
      commands.insert = {id: newSerIndex, data: newSer.data[0]};
    }
  }
  return commands;
};

Unique.prototype.updateExistingSer = function (serIndex, option) {
  var subIndex = this.cache[serIndex].indicies.indexOf(option.id);
  var commands = {};

  //update data
  this.cache[serIndex].data[subIndex] = option.data;

  //if this item is pos 0 in the ser
  if (subIndex === 0) {
    commands.update = {id: serIndex, data:option.data};
  }

  return commands;
};

Unique.prototype.modifyCacheIndicies = function (mutator) {
  _.forEach(this.cache, function (cacheItem) {
    cacheItem.indicies = _.map(cacheItem.indicies, function (index) {
      return mutator(index);
    });
  });

};

Unique.prototype.getSerIndexForOptionId = function (id) {
  return _.findIndex(this.cache, function (cacheItem) {
    return cacheItem.indicies.indexOf(id) > -1;
  });
};

Unique.prototype.getSerIndexForSerialization = function (serialization) {
  return _.findIndex(this.cache, {serialization: serialization});
};

Unique.prototype.handleInsert = function (option) {
  var serialization = this.serializer(option.data);
  var serIndex;
  var commands;

  //go through the index and increase the id of every item higher than option.id
  this.modifyCacheIndicies(function (index) {
    return index >= option.id ? index + 1 : index;
  });

  serIndex = this.getSerIndexForSerialization(serialization);

  //if something with this ser does not exist
  if (serIndex === -1) {
    commands = this.createNewSer(option, serialization);
  } else {
    commands = this.addToExistingSer(serIndex, option);
  }
  return commands;
};

Unique.prototype.handleUpdate = function (option) {
  var serialization = this.serializer(option.data);
  var oldSerIndex
  var serIndex;
  var newSerIndex;
  var commands1;
  var commands2;
  var commands = {};

  serIndex = this.getSerIndexForSerialization(serialization)
  oldSerIndex = this.getSerIndexForOptionId(option.id);
  //if new ser does not exist
  if (serIndex === -1) {

    //remove from the old ser
    commands1 = this.removeFromExistingSer(oldSerIndex, option);

    //create the new ser
    commands2 = this.createNewSer(option, serialization);

    commands = mergeCommands(commands1, commands2);

  //if the new ser is different than the old one
  } else if (serIndex !== oldSerIndex) {

    //remove from the old ser
    commands1 = this.removeFromExistingSer(oldSerIndex, option);

    //get the new serIndex, in case removeFromExistingSer changed it
    newSerIndex = this.getSerIndexForSerialization(serialization)

    //add to the new ser
    commands2 = this.addToExistingSer(newSerIndex, option);

    commands = mergeCommands(commands1, commands2);

  //else if the new and old sers are the same
  } else {
    //update the ser
    commands = this.updateExistingSer(serIndex, option);
  }

  return commands;
};

Unique.prototype.handleDelete = function (option) {
  var commands;

  oldSerIndex = this.getSerIndexForOption(option);

  //remove this entry from the existing ser
  commands = removeFromExistingSer(oldSerIndex, option);

  this.modifyCacheIndicies(function (index) {
    return index > option.id ? index - 1 : index;
  });

  return commands;
};

Unique.prototype._transform = function (option, encoding, callback) {
  var commands;

  switch (option.event) {
    case 'insert':
      commands = this.handleInsert(option);
      break;
    case 'update':
      commands = this.handleUpdate(option);
      break;
    case 'delete':
      commands = this.handleDelete(option);
      break;
  }
  this.trigger(commands);
  callback();
}

module.exports = Unique;
