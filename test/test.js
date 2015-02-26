var chai = require('chai');
var stream = require('stream');
var es = require('event-stream');

var lacona = require('lacona');
var phrase = require('lacona-phrase');
var Stateful = require('lacona-addon-stateful');
var Ordered = require('lacona-addon-ordered');
var fulltext = require('lacona-util-fulltext');

var Unique = require('..');

var expect = chai.expect;

describe('lacona-addon-unique', function () {
  var parser, stateful, ordered, unique;


  beforeEach(function () {
    parser = new lacona.Parser();
    stateful = new Stateful({serializer: fulltext.all});
    ordered = new Ordered({serializer: fulltext.all});
    unique = new Unique({serializer: fulltext.suggestion});
  });

  describe('basic usage', function () {
    var Test;

    beforeEach(function () {
      Test = phrase.createPhrase({
        describe: function () {
          return phrase.sequence(null,
            phrase.literal({text: 'test'}),
            phrase.choice(null,
              phrase.literal({text: 'aaa'}),
              phrase.literal({text: 'bbb'})
            )
          );
        }
      });

      parser.sentences = [phrase.createElement(Test)];
    });

    it('uniquifies updates within a single suggestion' , function (done) {
      function callback(err, data) {
        expect(data).to.have.length(1);

        //insert t[est]aaa
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('testaaa');
        //insert t[est]bbb

        done();
      }

      es.readArray(['t'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));
    });

    it('uniquifies updates within a single suggestion over time' , function (done) {
      function callback(err, data) {
        expect(data).to.have.length(5);

        //insert: t[est]aaa
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('testaaa');
        //insert: t[est]bbb

        ///delete t[est]aaa
        expect(data[1].event).to.equal('delete');
        expect(data[1].id).to.equal(data[0].id);
        expect(data[2].event).to.equal('insert');
        expect(fulltext.all(data[2].data)).to.equal('testbbb');
        //insert te[st]aaa
        expect(data[3].event).to.equal('delete');
        expect(data[3].id).to.equal(data[2].id);
        expect(data[4].event).to.equal('insert');
        expect(fulltext.all(data[4].data)).to.equal('testaaa');
        //delete t[est]bbb
        //insert te[st]bbb

        done();
      }

      es.readArray(['t', 'te'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));
    });

    it('uniquifies updates when changing the suggestion' , function (done) {
      function callback(err, data) {
        expect(data).to.have.length(3);

        //insert testb[bb]
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('testbbb');

        //insert tes[t]aaa
        expect(data[1].event).to.equal('insert');
        expect(fulltext.all(data[1].data)).to.equal('testaaa');
        //delete tesb[bb]
        expect(data[2].event).to.equal('delete');
        expect(data[2].id).to.equal(data[0].id);

        done();
      }

      es.readArray(['testb', 'tes'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));
    });

    it('removes uniqueness check when suggestion changes' , function (done) {
      function callback(err, data) {
        expect(data).to.have.length(6);

        //insert tes[t]aaa
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('testaaa');
        //insert tes[t]bbb

        //delete test[t]aaa
        expect(data[1].event).to.equal('delete');
        expect(data[1].id).to.equal(data[1].id);
        expect(data[2].event).to.equal('insert');
        expect(fulltext.all(data[2].data)).to.equal('testbbb');
        //insert test[aaa]
        expect(data[3].event).to.equal('insert');
        expect(fulltext.all(data[3].data)).to.equal('testaaa');
        //delete tes[t]bbb
        expect(data[4].event).to.equal('delete');
        expect(data[4].id).to.equal(data[2].id);
        //insert test[bbb]
        expect(data[5].event).to.equal('insert');
        expect(fulltext.all(data[5].data)).to.equal('testbbb');

        done();
      }

      es.readArray(['tes','test'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));
    });

    it('handles delete switches appropriately' , function (done) {
      function callback(err, data) {
        expect(data).to.have.length(5);

        //insert test[aaa]
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('testaaa');
        //insert test[bbb]
        expect(data[1].event).to.equal('insert');
        expect(fulltext.all(data[1].data)).to.equal('testbbb');

        //delete test[bbb]
        expect(data[2].event).to.equal('delete');
        expect(data[2].id).to.equal(data[1].id);
        //insert testb[bb]
        expect(data[3].event).to.equal('insert');
        expect(fulltext.all(data[3].data)).to.equal('testbbb');

        //delete test[aaa]
        expect(data[4].event).to.equal('delete');
        expect(data[4].id).to.equal(data[0].id);

        done();
      }

      es.readArray(['test','testb'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));
    });

    it('handles delete ignores appropriately' , function (done) {
      function callback(err, data) {
        expect(data).to.have.length(5);

        //insert tes[t]aaa
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('testaaa');
        //insert tes[t]bbb

        //delete tes[t]aaa
        expect(data[1].event).to.equal('delete');
        expect(data[1].id).to.equal(data[0].id);
        expect(data[2].event).to.equal('insert');
        expect(fulltext.all(data[2].data)).to.equal('testbbb');
        //insert testa[aa]
        expect(data[3].event).to.equal('insert');
        expect(fulltext.all(data[3].data)).to.equal('testaaa');
        //delete tes[t]bbb
        expect(data[4].event).to.equal('delete');
        expect(data[4].id).to.equal(data[2].id);

        done();
      }

      es.readArray(['tes','testa'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));
    });
  });

  describe('reverse order', function () {
    var Test;
    beforeEach(function () {
      Test = phrase.createPhrase({
        describe: function () {
          return phrase.sequence(null,
            phrase.literal({text: 'test'}),
            phrase.choice(null,
              phrase.literal({text: 'bbb'}),
              phrase.literal({text: 'aaa'})
            )
          );
        }
      });

      parser.sentences = [phrase.createElement(Test)];
    });

    it('allows for inserts into an existing unique group', function (done) {
      function callback(err, data) {
        expect(data).to.have.length(3);

        //insert t[est]bbb
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('testbbb');
        //insert t[est]aaa
        expect(data[1].event).to.equal('delete');
        expect(data[1].id).to.equal(data[0].id);
        expect(data[2].event).to.equal('insert');
        expect(fulltext.all(data[2].data)).to.equal('testaaa');

        done();
      }

      es.readArray(['t'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));
    });

    it('removes items from an existing unique group', function (done) {
      function callback(err, data) {
        expect(data).to.have.length(5);

        //insert t[est]bbb
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('testbbb');
        //insert t[est]aaa
        expect(data[1].event).to.equal('delete');
        expect(data[1].id).to.equal(data[0].id);
        expect(data[2].event).to.equal('insert');
        expect(fulltext.all(data[2].data)).to.equal('testaaa');

        //delete t[est]bbb
        //insert testb[bb]
        expect(data[3].event).to.equal('insert');
        expect(fulltext.all(data[3].data)).to.equal('testbbb');
        //delete t[est]aaa
        expect(data[4].event).to.equal('delete');
        expect(data[4].id).to.equal(data[2].id);

        done();
      }

      es.readArray(['t', 'testb'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));

    });

    it('removes items from an vanishing unique group', function (done) {
      function callback(err, data) {
        expect(data).to.have.length(7);

        //insert test[bbb]
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('testbbb');
        //insert test[aaa]
        expect(data[1].event).to.equal('insert');
        expect(fulltext.all(data[1].data)).to.equal('testaaa');

        //delete test[bbb]
        expect(data[2].event).to.equal('delete');
        expect(data[2].id).to.equal(data[0].id);
        //insert tes[t]bbb
        expect(data[3].event).to.equal('insert');
        expect(fulltext.all(data[3].data)).to.equal('testbbb');
        //delete test[aaa]
        expect(data[4].event).to.equal('delete');
        expect(data[4].id).to.equal(data[1].id);
        //insert test[t]aaa
        expect(data[5].event).to.equal('delete');
        expect(data[5].id).to.equal(data[3].id);
        expect(data[6].event).to.equal('insert');
        expect(fulltext.all(data[6].data)).to.equal('testaaa');

        done();
      }

      es.readArray(['test', 'tes'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));

    });

  });

  describe('group of 3', function () {
    var Test;

    beforeEach(function () {
      Test = phrase.createPhrase({
        describe: function () {
          return phrase.sequence(null,
            phrase.literal({text: '1'}),
            phrase.literal({text: '2'}),
            phrase.choice(null,
              phrase.literal({text: 'ccc'}),
              phrase.literal({text: 'aaa'}),
              phrase.literal({text: 'bbb'})
            )
          );
        }
      });

      parser.sentences = [phrase.createElement(Test)];
    });

    it('handles updates into new sers properly', function (done) {
      function callback(err, data) {
        expect(data).to.have.length(9);

        //insert [1]2ccc
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('12ccc');
        //insert [1]2aaa
        expect(data[1].event).to.equal('delete');
        expect(data[1].id).to.equal(data[0].id);
        expect(data[2].event).to.equal('insert');
        expect(fulltext.all(data[2].data)).to.equal('12aaa');
        //insert [1]2bbb

        //delete [1]2ccc
        //insert 1[2]ccc
        expect(data[3].event).to.equal('insert');
        expect(fulltext.all(data[3].data)).to.equal('12ccc');
        //delete [1]2aaa
        expect(data[4].event).to.equal('delete');
        expect(data[4].id).to.equal(data[2].id);
        expect(data[5].event).to.equal('insert');
        expect(fulltext.all(data[5].data)).to.equal('12bbb');
        //insert 1[2]aaa
        expect(data[6].event).to.equal('delete');
        expect(data[6].id).to.equal(data[3].id);
        expect(data[7].event).to.equal('insert');
        expect(fulltext.all(data[7].data)).to.equal('12aaa');
        //delete [1]2bbb
        expect(data[8].event).to.equal('delete');
        expect(data[8].id).to.equal(data[5].id);
        //insert 1[2]bbb

        done();
      }

      es.readArray(['', '1'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));

    });

    it('handles going back to old sers properly', function (done) {
      function callback(err, data) {
        expect(data).to.have.length(9);

        //insert 1[2]ccc
        expect(data[0].event).to.equal('insert');
        expect(fulltext.all(data[0].data)).to.equal('12ccc');
        //insert 1[2]aaa
        expect(data[1].event).to.equal('delete');
        expect(data[1].id).to.equal(data[0].id);
        expect(data[2].event).to.equal('insert');
        expect(fulltext.all(data[2].data)).to.equal('12aaa');
        //insert 1[2]bbb

        //delete 1[2]ccc
        //insert [1]2ccc
        expect(data[3].event).to.equal('insert');
        expect(fulltext.all(data[3].data)).to.equal('12ccc');
        //delete 1[2]aaa
        expect(data[4].event).to.equal('delete');
        expect(data[4].id).to.equal(data[2].id);
        expect(data[5].event).to.equal('insert');
        expect(fulltext.all(data[5].data)).to.equal('12bbb');
        //insert [1]2aaa
        expect(data[6].event).to.equal('delete');
        expect(data[6].id).to.equal(data[3].id);
        expect(data[7].event).to.equal('insert');
        expect(fulltext.all(data[7].data)).to.equal('12aaa');
        //delete 1[2]bbb
        expect(data[8].event).to.equal('delete');
        expect(data[8].id).to.equal(data[5].id);
        //insert [1]2bbb

        done();
      }

      es.readArray(['1', ''])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(es.writeArray(callback));
    });


    // it('handles toggling over old sers properly', function (done) {
    //   function callback(err, data) {
    //     expect(data).to.have.length(15);
    //
    //     //insert ccc:0
    //     expect(data[0].event).to.equal('insert'); //insert ccc:0
    //     expect(data[0].id).to.equal(0);
    //     //insert aaa:0
    //     expect(data[1].event).to.equal('delete'); //delete ccc:0
    //     expect(data[1].id).to.equal(0);
    //     expect(data[2].event).to.equal('insert'); //insert aaa:0
    //     expect(data[2].id).to.equal(0);
    //     //insert bbb:1
    //
    //     //update ccc:2 (new ser)
    //     expect(data[3].event).to.equal('insert'); //insert ccc:1
    //     expect(data[3].id).to.equal(1);
    //     //update aaa:0
    //     expect(data[4].event).to.equal('delete'); //delete aaa:0
    //     expect(data[4].id).to.equal(0);
    //     expect(data[5].event).to.equal('insert'); //insert bbb:0
    //     expect(data[5].id).to.equal(0);
    //     expect(data[6].event).to.equal('delete'); //delete ccc:1
    //     expect(data[6].id).to.equal(1);
    //     expect(data[7].event).to.equal('insert'); //insert aaa:0
    //     expect(data[7].id).to.equal(0);
    //     expect(data[8].event).to.equal('delete'); //delete ccc:1
    //     expect(data[8].id).to.equal(1);
    //     //update bbb:1
    //
    //     //update ccc:2 (new ser)
    //     expect(data[9].event).to.equal('insert'); //insert ccc:1
    //     expect(data[9].id).to.equal(1);
    //     //update aaa:0
    //     expect(data[10].event).to.equal('delete'); //delete aaa:0
    //     expect(data[10].id).to.equal(0);
    //     expect(data[11].event).to.equal('insert'); //insert bbb:0
    //     expect(data[11].id).to.equal(0);
    //     expect(data[12].event).to.equal('delete'); //delete ccc:1
    //     expect(data[12].id).to.equal(1);
    //     expect(data[13].event).to.equal('insert'); //insert aaa:0
    //     expect(data[13].id).to.equal(0);
    //     expect(data[14].event).to.equal('delete'); //delete ccc:1
    //     expect(data[14].id).to.equal(1);
    //     //update bbb:1
    //
    //     done();
    //   }
    //
    //   es.readArray(['', '1', ''])
    //     .pipe(parser)
    //     .pipe(stateful)
    //     .pipe(ordered)
    //     .pipe(unique)
    //     .pipe(es.writeArray(callback));
    //
    // });
  });
});
