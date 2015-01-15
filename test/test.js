var chai = require('chai');
var stream = require('stream');

var lacona = require('lacona');
var Stateful = require('lacona-addon-stateful');
var Ordered = require('lacona-addon-ordered');
var fulltext = require('lacona-util-fulltext');

var Unique = require('..');

var expect = chai.expect;

function toStream(strings) {
  var newStream = new stream.Readable({objectMode: true});

  strings.forEach(function (string) {
    newStream.push(string);
  });
  newStream.push(null);

  return newStream;
}

function toArray(done) {
  var newStream = new stream.Writable({objectMode: true});
  var list = [];
  newStream.write = function(obj) {
    list.push(obj);
  };

  newStream.end = function() {
    done(list);
  };

  return newStream;
}

function suggestionFulltext(option) {
  return option.suggestion.words.map(function (word) {
    return word.string;
  }).join();
}


describe('lacona-addon-unique', function () {
  var parser, stateful, ordered, unique;

  beforeEach(function () {
    var test = lacona.createPhrase({
      name: 'test/test',
      describe: function () {
        return lacona.sequence({children: [
          lacona.literal({text: 'test'}),
          lacona.choice({children: [
            lacona.literal({text: 'aaa'}),
            lacona.literal({text: 'bbb'})
          ]})
        ]});
      }
    });

    parser = new lacona.Parser();
    parser.sentences = [test()];
    stateful = new Stateful({serializer: fulltext});
    ordered = new Ordered({comparator: fulltext});
    unique = new Unique({serializer: suggestionFulltext});
  });

  it('uniquifies updates within a single suggestion' , function (done) {
    function callback(data) {
      expect(data).to.have.length(2);
      expect(data[0].event).to.equal('insert');
      expect(data[0].data.suggestion.words[0].string).to.equal('test');
      expect(data[0].data.completion[0].string).to.equal('aaa');

      expect(data[1].event).to.equal('update');
      expect(data[1].data.suggestion.words[0].string).to.equal('test');
      expect(data[1].data.completion[0].string).to.equal('aaa');

      done();
    }

    toStream(['t', 'te'])
      .pipe(parser)
      .pipe(stateful)
      .pipe(ordered)
      .pipe(unique)
      .pipe(toArray(callback));
  });

  it('uniquifies updates when changing the suggestion' , function (done) {
    function callback(data) {
      expect(data).to.have.length(3);

      expect(data[0].id).to.equal(0);
      expect(data[0].event).to.equal('insert');
      expect(data[0].data.match[0].string).to.equal('test');
      expect(data[0].data.suggestion.words[0].string).to.equal('bbb');

      expect(data[1].event).to.equal('insert');
      expect(data[1].id).to.equal(0);
      expect(data[1].data.suggestion.words[0].string).to.equal('test');
      expect(data[1].data.completion[0].string).to.equal('aaa');

      expect(data[2].event).to.equal('delete');
      expect(data[2].id).to.equal(1);

      done();
    }

    toStream(['testb', 'tes'])
      .pipe(parser)
      .pipe(stateful)
      .pipe(ordered)
      .pipe(unique)
      .pipe(toArray(callback));
  });

  it('removes uniqueness check when suggestion changes' , function (done) {
    function callback(data) {
      expect(data).to.have.length(4);

      expect(data[0].id).to.equal(0);
      expect(data[0].event).to.equal('insert');
      expect(data[0].data.suggestion.words[0].string).to.equal('test');
      expect(data[0].data.completion[0].string).to.equal('aaa');

      expect(data[1].event).to.equal('update');
      expect(data[1].id).to.equal(0);
      expect(data[1].data.match[0].string).to.equal('test');
      expect(data[1].data.suggestion.words[0].string).to.equal('aaa');

      expect(data[2].event).to.equal('insert');
      expect(data[2].id).to.equal(1);
      expect(data[2].data.suggestion.words[0].string).to.equal('test');
      expect(data[2].data.completion[0].string).to.equal('bbb');

      expect(data[3].event).to.equal('update');
      expect(data[3].id).to.equal(1);
      expect(data[3].data.match[0].string).to.equal('test');
      expect(data[3].data.suggestion.words[0].string).to.equal('bbb');

      done();
    }

    toStream(['tes','test'])
      .pipe(parser)
      .pipe(stateful)
      .pipe(ordered)
      .pipe(unique)
      .pipe(toArray(callback));
  });
});
