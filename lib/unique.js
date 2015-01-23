var _ = require('lodash');
var inherits = require('inherits');
var Transform = require('stream').Transform;

function Unique(options) {
  Transform.call(this, {objectMode: true});

  this.serializer = options.serializer;

  this.cache = {};
}

inherits(Unique, Transform);

function getSortIndex(option) {
  return typeof option.sortIndex === 'undefined' ? option.id : option.sortIndex;
}

function createSer(option) {
  var sortIndex = getSortIndex(option);
  return [{id: option.id, sortIndex: sortIndex, data: option.data}];
}

Unique.prototype.triggerInsert = function(id, data) {
  var result = {
    event: 'insert',
    id: id,
    data: data
  };
  this.push(result);
};

Unique.prototype.triggerDelete = function(id) {
  var result = {
    event: 'delete',
    id: id,
  };
  this.push(result);
};

Unique.prototype.createNewSer = function (serialized, option) {
  // create a new ser, indicies: [id]
  var newSer = createSer(option);

  // insert it into index
  this.cache[serialized] = newSer;

  //trigger an insert
  this.triggerInsert(option.id, option.data);
};

Unique.prototype.addToExistingSer = function(serialized, option) {
  // get the existing ser
  var newSer = this.cache[serialized];

  // insert the ser sorted
  var sortIndex = getSortIndex(option);
  var newSubIndex = _.sortedIndex(newSer, {sortIndex: sortIndex}, 'sortIndex');
  var newEntry = {
    id: option.id,
    sortIndex: sortIndex,
    data: option.data
  };
  newSer.splice(newSubIndex, 0, newEntry);

  // if it was inserted at pos 0
  if (newSubIndex === 0) {
    this.triggerDelete(newSer[1].id);
    this.triggerInsert(option.id, option.data);
  }
};

Unique.prototype.removeFromExistingSer = function (serialized, option) {
  var newSer;
  var subIndex;
  var oldEntry;

  //if this is the last item in the ser
  if (this.cache[serialized].length === 1)  {
    this.triggerDelete(this.cache[serialized][0].id);

    delete this.cache[serialized];
  //else
  } else {

    //get the existing ser
    newSer = this.cache[serialized];

    //remove id and data from the old ser
    subIndex = _.findIndex(newSer, {id: option.id}, 'id');
    oldEntry = newSer.splice(subIndex, 1)[0];

    //if the old item was pos 0 in the old ser
    if (subIndex === 0) {
      this.triggerDelete(oldEntry.id);
      this.triggerInsert(newSer[0].id, newSer[0].data);
    }
  }
};

Unique.prototype.modifySortIndicies = function (mutator) {
  _.forEach(this.cache, function (cacheItem) {
    _.forEach(cacheItem, function (entry) {
      if (entry.sortIndex) {
        entry.sortIndex = mutator(entry.sortIndex);
      }
    });
  });

};

Unique.prototype.getSerializedForOptionId = function (id) {
  return _.findKey(this.cache, function (entry) {
    return _.findIndex(entry, {id: id}, 'id') !== -1;
  });
};

Unique.prototype.handleInsert = function (option) {
  var serialized = this.serializer(option.data);

  //if something with this ser does not exist
  if (this.cache[serialized]) {
    this.addToExistingSer(serialized, option);
  } else {
    this.createNewSer(serialized, option);
  }
};

Unique.prototype.handleDelete = function (option) {
  var oldSerialized = this.getSerializedForOptionId(option.id);

  //remove this entry from the existing ser
  this.removeFromExistingSer(oldSerialized, option);
};

Unique.prototype._transform = function (option, encoding, callback) {
  switch (option.event) {
    case 'insert':
      //go through the index and increase the id of every item higher than option.id
      this.modifySortIndicies(function (index) {
        return index >= option.sortIndex ? index + 1 : index;
      });

      this.handleInsert(option);
      break;
    case 'delete':
      this.handleDelete(option);

      this.modifySortIndicies(function (index) {
        return index > option.sortIndex ? index - 1 : index;
      });
      break;
  }
  callback();
};

module.exports = Unique;
