define("htmlbars",
  ["htmlbars/parser","htmlbars/ast","htmlbars/compiler","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var preprocess = __dependency1__.preprocess;
    var ElementNode = __dependency2__.ElementNode;
    var BlockNode = __dependency2__.BlockNode;
    var compile = __dependency3__.compile;

    __exports__.preprocess = preprocess;
    __exports__.compile = compile;
    __exports__.ElementNode = ElementNode;
    __exports__.BlockNode = BlockNode;
  });
define("htmlbars/ast",
  ["handlebars/compiler/ast","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var AST = __dependency1__["default"];

    var MustacheNode = AST.MustacheNode;
    __exports__.MustacheNode = MustacheNode;var SexprNode = AST.SexprNode;
    __exports__.SexprNode = SexprNode;var HashNode = AST.HashNode;
    __exports__.HashNode = HashNode;var IdNode = AST.IdNode;
    __exports__.IdNode = IdNode;var StringNode = AST.StringNode;
    __exports__.StringNode = StringNode;
    function ProgramNode(statements, strip) {
      this.type = 'program';
      this.statements = statements;
      this.strip = strip;
    }

    __exports__.ProgramNode = ProgramNode;function BlockNode(mustache, program, inverse, strip) {
      this.type = 'block';
      this.mustache = mustache;
      this.program = program;
      this.inverse = inverse;
      this.strip = strip;
    }

    __exports__.BlockNode = BlockNode;function ElementNode(tag, attributes, helpers, children) {
      this.type = 'element';
      this.tag = tag;
      this.attributes = attributes;
      this.helpers = helpers;
      this.children = children;
    }

    __exports__.ElementNode = ElementNode;function AttrNode(name, value) {
      this.type = 'attr';
      this.name = name;
      this.value = value;
    }

    __exports__.AttrNode = AttrNode;function TextNode(chars) {
      this.type = 'text';
      this.chars = chars;
    }

    __exports__.TextNode = TextNode;function childrenFor(node) {
      if (node.type === 'program') return node.statements;
      if (node.type === 'element') return node.children;
    }

    __exports__.childrenFor = childrenFor;function isCurly(node) {
      return node.type === 'mustache' || node.type === 'block';
    }

    __exports__.isCurly = isCurly;function appendChild(parent, node) {
      var children = childrenFor(parent);

      var len = children.length, last;
      if (len > 0) {
        last = children[len-1];
        if (isCurly(last) && isCurly(node)) {
          children.push(new TextNode(''));
        }
      }
      children.push(node);
    }

    __exports__.appendChild = appendChild;
  });
define("htmlbars/compiler",
  ["htmlbars/parser","htmlbars/compiler/template","htmlbars/runtime/dom_helpers","htmlbars/runtime/placeholder","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    /*jshint evil:true*/
    var preprocess = __dependency1__.preprocess;
    var TemplateCompiler = __dependency2__.TemplateCompiler;
    var domHelpers = __dependency3__.domHelpers;
    var Placeholder = __dependency4__.Placeholder;

    function compile(string, options) {
      return compileSpec(string, options)(domHelpers(), Placeholder);
    }

    __exports__.compile = compile;function compileSpec(string, options) {
      var ast = preprocess(string, options);
      var compiler = new TemplateCompiler();
      var program = compiler.compile(ast);
      return new Function("dom", "Placeholder", "return " + program);
    }

    __exports__.compileSpec = compileSpec;
  });
define("htmlbars/compiler/ast_walker",
  ["htmlbars/ast","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var childrenFor = __dependency1__.childrenFor;

    function Frame(program, parent, isBlock) {
      this.parent = parent;
      this.program = program;
      this.children = childrenFor(program);
      this.length = this.children.length;

      // cursor
      this.pos = this.length-1;
      this.inverse = false;

      // block tracking
      this.isBlock = isBlock;
      this.block = isBlock ? this : parent.block;
      this.stack = isBlock ? [['endTemplate', program]] : null;
      this.count = 0;
      this.mustacheCount = 0;
    }

    Frame.prototype.next = function() {
      var node;
      while (this.pos >= 0) {
        node = this.children[this.pos];
        if (this.inverse) {
          this.inverse = false;
          this.pos--;
          this.block.count++;
          return new Frame(node.program, this, true);
        }
        if (node.type === 'text') {
          this.block.stack.push(['text', node, this.pos, this.length]);
        } else if (node.type === 'block') {
          this.mustacheCount++;
          this.block.stack.push(['block', node, this.pos, this.length]);
          if (node.inverse) {
            this.inverse = true;
            this.block.count++;
            return new Frame(node.inverse, this, true);
          } else {
            this.pos--;
            this.block.count++;
            return new Frame(node.program, this, true);
          }
        } else if (node.type === 'element') {
          if (this.childElementFrame) {
            this.block.stack.push(['openElement', node, this.pos, this.length, this.childElementFrame.mustacheCount]);
            if (this.childElementFrame.mustacheCount) {
              // We only increment once vs add the mustache count because a child
              // element with multiple nodes is just a single consumer.
              this.mustacheCount++;
            }
            this.childElementFrame = null;
          } else {
            this.block.stack.push(['closeElement', node, this.pos, this.length]);
            this.childElementFrame = new Frame(node, this, false);
            this.childElementFrame.mustacheCount = node.helpers.length;
            return this.childElementFrame;
          }
        } else {
          if (node.type === 'mustache') {
            this.mustacheCount++;
          }
          this.block.stack.push(['node', node, this.pos, this.length]);
        }
        this.pos--;
      }
      if (this.isBlock) {
        this.block.stack.push(['startTemplate', this.program, this.block.count]);
      }
      return null;
    };

    function ASTWalker(compiler) {
      this.compiler = compiler;
    }

    __exports__.ASTWalker = ASTWalker;// Walks tree backwards depth first so that child
    // templates can be push onto stack then popped
    // off for its parent.
    ASTWalker.prototype.visit = function(program) {
      var frame = new Frame(program, null, true), next;
      while (frame) {
        next = frame.next();
        if (next === null) {
          if (frame.isBlock) {
            this.send(frame.stack);
          }
          frame = frame.parent;
        } else {
          frame = next;
        }
      }
    };

    ASTWalker.prototype.send = function(stack) {
      var compiler = this.compiler, tuple, name;
      while (tuple = stack.pop()) {
        name = tuple.shift();
        compiler[name].apply(compiler, tuple);
      }
    };

    // compiler.startTemplate(program, childTemplateCount);
    // compiler.endTemplate(program);
    // compiler.block(block, index, length);
    // compiler.openElement(element, index, length);
    // compiler.text(text, index, length);
    // compiler.closeElement(element, index, length);
    // compiler.node(node, index, length)
  });
define("htmlbars/compiler/fragment",
  ["htmlbars/compiler/utils","htmlbars/compiler/quoting","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var processOpcodes = __dependency1__.processOpcodes;
    var string = __dependency2__.string;

    function FragmentCompiler() {
      this.source = [];
      this.depth = 0;
    }

    __exports__.FragmentCompiler = FragmentCompiler;FragmentCompiler.prototype.compile = function(opcodes) {
      this.source.length = 0;
      this.depth = 0;

      this.source.push('function build(dom) {\n');
      processOpcodes(this, opcodes);
      this.source.push('}\n');

      return this.source.join('');
    };

    FragmentCompiler.prototype.empty = function() {
      this.source.push('  return dom.createDocumentFragment();\n');
    };

    FragmentCompiler.prototype.startFragment = function() {
      this.source.push('  var el0 = dom.createDocumentFragment();\n');
    };

    FragmentCompiler.prototype.endFragment = function() {
      this.source.push('  return el0;\n');
    };

    FragmentCompiler.prototype.openRootElement = function(tagName) {
      this.source.push('  var el0 = dom.createElement('+string(tagName)+');\n');
    };

    FragmentCompiler.prototype.closeRootElement = function() {
      this.source.push('  return el0;\n');
    };

    FragmentCompiler.prototype.rootText = function(str) {
      this.source.push('  return dom.createTextNode('+string(str)+');\n');
    };

    FragmentCompiler.prototype.openElement = function(tagName) {
      var el = 'el'+(++this.depth);
      this.source.push('  var '+el+' = dom.createElement('+string(tagName)+');\n');
    };

    FragmentCompiler.prototype.setAttribute = function(name, value) {
      var el = 'el'+this.depth;
      this.source.push('  dom.setAttribute('+el+','+string(name)+','+string(value)+');\n');
    };

    FragmentCompiler.prototype.text = function(str) {
      var el = 'el'+this.depth;
      this.source.push('  dom.appendText('+el+','+string(str)+');\n');
    };

    FragmentCompiler.prototype.closeElement = function() {
      var child = 'el'+(this.depth--);
      var el = 'el'+this.depth;
      this.source.push('  '+el+'.appendChild('+child+');\n');
    };
  });
define("htmlbars/compiler/fragment_opcode",
  ["./ast_walker","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ASTWalker = __dependency1__.ASTWalker;

    function FragmentOpcodeCompiler() {
      this.opcodes = [];
    }

    FragmentOpcodeCompiler.prototype.compile = function(ast) {
      var astWalker = new ASTWalker(this);
      astWalker.visit(ast);
      return this.opcodes;
    };

    FragmentOpcodeCompiler.prototype.opcode = function(type, params) {
      this.opcodes.push([type, params]);
    };

    FragmentOpcodeCompiler.prototype.text = function(text) {
      this.opcode('text', [text.chars]);
    };

    FragmentOpcodeCompiler.prototype.openElement = function(element) {
      this.opcode('openElement', [element.tag]);

      element.attributes.forEach(function(attribute) {
        this.attribute(attribute);
      }, this);
    };

    FragmentOpcodeCompiler.prototype.closeElement = function(element) {
      this.opcode('closeElement', [element.tag]);
    };

    FragmentOpcodeCompiler.prototype.startTemplate = function(program) {
      this.opcodes.length = 0;
      if (program.statements.length > 1) {
        this.opcode('startFragment');
      }
    };

    FragmentOpcodeCompiler.prototype.endTemplate = function(program) {
      if (program.statements.length === 0) {
        this.opcode('empty');
      } else if (program.statements.length === 1) {
        if (program.statements[0].type === 'text') {
          this.opcodes[0][0] = 'rootText';
        } else {
          var opcodes = this.opcodes;
          opcodes[0][0] = 'openRootElement';
          opcodes[opcodes.length-1][0] = 'closeRootElement';
        }
      } else {
        this.opcode('endFragment');
      }
    };

    FragmentOpcodeCompiler.prototype.node = function () {};

    FragmentOpcodeCompiler.prototype.block = function () {};

    FragmentOpcodeCompiler.prototype.attribute = function(attr) {
      if (attr.value.type === 'text') {
        this.opcode('setAttribute', [attr.name, attr.value.chars]);
      }
    };

    __exports__.FragmentOpcodeCompiler = FragmentOpcodeCompiler;
  });
define("htmlbars/compiler/helpers",
  ["htmlbars/compiler/quoting","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var array = __dependency1__.array;
    var hash = __dependency1__.hash;
    var string = __dependency1__.string;

    function prepareHelper(stack, size) {
      var args = [],
          types = [],
          hashPairs = [],
          hashTypes = [],
          keyName,
          i;

      var hashSize = stack.pop();

      for (i=0; i<hashSize; i++) {
        keyName = stack.pop();
        hashPairs.unshift(keyName + ':' + stack.pop());
        hashTypes.unshift(keyName + ':' + stack.pop());
      }

      for (i=0; i<size; i++) {
        args.unshift(stack.pop());
        types.unshift(stack.pop());
      }

      var programId = stack.pop();
      var inverseId = stack.pop();

      var options = ['types:' + array(types), 'hashTypes:' + hash(hashTypes), 'hash:' + hash(hashPairs)];

      if (programId !== null) {
        options.push('render:child' + programId);
      }

      if (inverseId !== null) {
        options.push('inverse:child' + inverseId);
      }

      return {
        options: options,
        args: array(args)
      };
    }

    __exports__.prepareHelper = prepareHelper;
  });
define("htmlbars/compiler/hydration",
  ["htmlbars/compiler/utils","htmlbars/compiler/helpers","htmlbars/compiler/quoting","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var processOpcodes = __dependency1__.processOpcodes;
    var prepareHelper = __dependency2__.prepareHelper;
    var string = __dependency3__.string;
    var quotedArray = __dependency3__.quotedArray;
    var hash = __dependency3__.hash;
    var array = __dependency3__.array;

    function HydrationCompiler() {
      this.stack = [];
      this.source = [];
      this.mustaches = [];
      this.parents = ['fragment'];
      this.parentCount = 0;
      this.declarations = [];
    }

    var prototype = HydrationCompiler.prototype;

    prototype.compile = function(opcodes) {
      this.stack.length = 0;
      this.mustaches.length = 0;
      this.source.length = 0;
      this.parents.length = 1;
      this.declarations.length = 0;
      this.parentCount = 0;

      processOpcodes(this, opcodes);

      if (this.declarations.length) {
        var decs = "  var ";
        for (var i = 0, l = this.declarations.length; i < l; ++i) {
          var dec = this.declarations[i];
          decs += dec[0];
          decs += " = ";
          decs += dec[1];
          if (i+1 === l) {
            decs += ';\n';
          } else {
            decs += ', ';
          }
        }
        this.source.unshift(decs);
      }

      return this.source.join('');
    };

    prototype.program = function(programId, inverseId) {
      this.stack.push(inverseId);
      this.stack.push(programId);
    };

    prototype.id = function(parts) {
      this.stack.push(string('id'));
      this.stack.push(string(parts.join('.')));
    };

    prototype.literal = function(literal) {
      this.stack.push(string(typeof literal));
      this.stack.push(literal);
    };

    prototype.stringLiteral = function(str) {
      this.stack.push(string('string'));
      this.stack.push(string(str));
    };

    prototype.stackLiteral = function(literal) {
      this.stack.push(literal);
    };

    prototype.helper = function(name, size, escaped, placeholderNum) {
      var prepared = prepareHelper(this.stack, size);
      prepared.options.push('escaped:'+escaped);
      prepared.options.push('data:(typeof options !== "undefined" && options.data)');
      this.pushMustacheInContent(string(name), prepared.args, prepared.options, placeholderNum);
    };

    prototype.ambiguous = function(str, escaped, placeholderNum) {
      this.pushMustacheInContent(string(str), '[]', ['escaped:'+escaped], placeholderNum);
    };

    prototype.ambiguousAttr = function(str, escaped) {
      this.stack.push('['+string(str)+', [], {escaped:'+escaped+'}]');
    };

    prototype.helperAttr = function(name, size, escaped) {
      var prepared = prepareHelper(this.stack, size);
      prepared.options.push('escaped:'+escaped);

      this.stack.push('['+string(name)+','+prepared.args+','+ hash(prepared.options)+']');
    };

    prototype.sexpr = function(name, size) {
      var prepared = prepareHelper(this.stack, size);

      //export function SUBEXPR(helperName, context, params, options) {
      this.stack.push('helpers.SUBEXPR(' + string(name) + ', context, ' + prepared.args + ', ' + hash(prepared.options) + ', helpers)');
    };

    prototype.string = function(str) {
      this.stack.push(string(str));
    };

    prototype.nodeHelper = function(name, size) {
      var prepared = prepareHelper(this.stack, size);
      this.pushMustacheInNode(string(name), prepared.args, prepared.options);
    };

    prototype.placeholder = function(num, parentPath, startIndex, endIndex) {
      var parentIndex = parentPath.length === 0 ? 0 : parentPath[parentPath.length-1];
      var parent = this.getParent();
      var placeholder = "Placeholder.create("+parent+","+
        (startIndex === null ? "-1" : startIndex)+","+
        (endIndex === null ? "-1" : endIndex)+")";

      this.declarations.push(['placeholder' + num, placeholder]);
    };

    prototype.pushMustacheInContent = function(name, args, pairs, placeholderNum) {
      this.source.push('  helpers.CONTENT(placeholder' + placeholderNum + ', ' + name + ', context, ' + args + ', ' + hash(pairs) + ', helpers);\n');
    };

    prototype.pushMustacheInNode = function(name, args, pairs) {
      this.source.push('  helpers.ELEMENT(' + this.getParent() + ', ' + name + ', context, ' + args + ', ' + hash(pairs) + ', helpers);\n');
    };

    prototype.shareParent = function(i) {
      var parentNodesName = "parent" + this.parentCount++;
      this.declarations.push([parentNodesName, this.getParent() + '.childNodes[' + i + ']']);
      this.parents.push(parentNodesName);
    };

    prototype.consumeParent = function(i) {
      this.parents.push(this.getParent() + '.childNodes[' + i + ']');
    };

    prototype.popParent = function() {
      this.parents.pop();
    };

    prototype.getParent = function() {
      return this.parents[this.parents.length-1];
    };

    __exports__.HydrationCompiler = HydrationCompiler;
  });
define("htmlbars/compiler/hydration_opcode",
  ["./ast_walker","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ASTWalker = __dependency1__.ASTWalker;

    function HydrationOpcodeCompiler() {
      this.opcodes = [];
      this.paths = [];
      this.templateId = 0;
      this.currentDOMChildIndex = 0;
      this.placeholders = [];
      this.placeholderNum = 0;
    }

    HydrationOpcodeCompiler.prototype.compile = function(ast) {
      var astWalker = new ASTWalker(this);
      astWalker.visit(ast);
      return this.opcodes;
    };

    HydrationOpcodeCompiler.prototype.startTemplate = function() {
      this.opcodes.length = 0;
      this.paths.length = 0;
      this.placeholders.length = 0;
      this.templateId = 0;
      this.currentDOMChildIndex = -1;
      this.placeholderNum = 0;
    };

    HydrationOpcodeCompiler.prototype.endTemplate = function(program) {
      distributePlaceholders(this.placeholders, this.opcodes);
      if (program.statements.length === 1 && program.statements[0].type !== 'text') {
        this.opcodes.shift();
        this.opcodes.pop();
      }
    };

    HydrationOpcodeCompiler.prototype.text = function(string) {
      ++this.currentDOMChildIndex;
    };

    HydrationOpcodeCompiler.prototype.openElement = function(element, pos, len, mustacheCount) {
      distributePlaceholders(this.placeholders, this.opcodes);
      ++this.currentDOMChildIndex;

      if (mustacheCount > 1) {
        this.opcode('shareParent', this.currentDOMChildIndex);
      } else {
        this.opcode('consumeParent', this.currentDOMChildIndex);
      }

      this.paths.push(this.currentDOMChildIndex);
      this.currentDOMChildIndex = -1;

      element.attributes.forEach(function(attribute) {
        this.attribute(attribute);
      }, this);

      element.helpers.forEach(function(helper) {
        this.nodeHelper(helper);
      }, this);
    };

    HydrationOpcodeCompiler.prototype.closeElement = function(element) {
      distributePlaceholders(this.placeholders, this.opcodes);
      this.opcode('popParent');
      this.currentDOMChildIndex = this.paths.pop();
    };

    HydrationOpcodeCompiler.prototype.node = function (node, childIndex, childrenLength) {
      this[node.type](node, childIndex, childrenLength);
    };

    HydrationOpcodeCompiler.prototype.block = function(block, childIndex, childrenLength) {
      var currentDOMChildIndex = this.currentDOMChildIndex,
          mustache = block.mustache;

      var start = (currentDOMChildIndex < 0 ? null : currentDOMChildIndex),
          end = (childIndex === childrenLength - 1 ? null : currentDOMChildIndex + 1);

      var placeholderNum = this.placeholderNum++;
      this.placeholders.push([placeholderNum, this.paths.slice(), start, end]);

      this.opcode('program', this.templateId++, block.inverse === null ? null : this.templateId++);
      processParams(this, mustache.params);
      processHash(this, mustache.hash);
      this.opcode('helper', mustache.id.string, mustache.params.length, mustache.escaped, placeholderNum);
    };

    HydrationOpcodeCompiler.prototype.opcode = function(type) {
      var params = [].slice.call(arguments, 1);
      this.opcodes.push([type, params]);
    };

    HydrationOpcodeCompiler.prototype.attribute = function(attr) {
      if (attr.value.type === 'text') return;

      // We treat attribute like a ATTRIBUTE helper evaluated by the ELEMENT hook.
      // <p {{ATTRIBUTE 'class' 'foo ' (bar)}}></p>
      // Unwrapped any mustaches to just be their internal sexprs.
      this.nodeHelper({
        params: [attr.name, attr.value.sexpr],
        hash: null,
        id: {
          string: 'ATTRIBUTE'
        }
      });
    };

    HydrationOpcodeCompiler.prototype.nodeHelper = function(mustache) {
      this.opcode('program', null, null);
      processParams(this, mustache.params);
      processHash(this, mustache.hash);
      this.opcode('nodeHelper', mustache.id.string, mustache.params.length, this.paths.slice());
    };

    HydrationOpcodeCompiler.prototype.mustache = function(mustache, childIndex, childrenLength) {
      var currentDOMChildIndex = this.currentDOMChildIndex;

      var start = currentDOMChildIndex,
          end = (childIndex === childrenLength - 1 ? -1 : currentDOMChildIndex + 1);

      var placeholderNum = this.placeholderNum++;
      this.placeholders.push([placeholderNum, this.paths.slice(), start, end]);

      if (mustache.isHelper) {
        this.opcode('program', null, null);
        processParams(this, mustache.params);
        processHash(this, mustache.hash);
        this.opcode('helper', mustache.id.string, mustache.params.length, mustache.escaped, placeholderNum);
      } else {
        this.opcode('ambiguous', mustache.id.string, mustache.escaped, placeholderNum);
      }
    };

    HydrationOpcodeCompiler.prototype.sexpr = function(sexpr) {
      this.string('sexpr');
      this.opcode('program', null, null);
      processParams(this, sexpr.params);
      processHash(this, sexpr.hash);
      this.opcode('sexpr', sexpr.id.string, sexpr.params.length);
    };

    HydrationOpcodeCompiler.prototype.string = function(str) {
      this.opcode('string', str);
    };

    HydrationOpcodeCompiler.prototype.mustacheInAttr = function(mustache) {
      if (mustache.isHelper) {
        this.opcode('program', null, null);
        processParams(this, mustache.params);
        processHash(this, mustache.hash);
        this.opcode('helperAttr', mustache.id.string, mustache.params.length, mustache.escaped);
      } else {
        this.opcode('ambiguousAttr', mustache.id.string, mustache.escaped);
      }
    };

    HydrationOpcodeCompiler.prototype.ID = function(id) {
      this.opcode('id', id.parts);
    };

    HydrationOpcodeCompiler.prototype.STRING = function(string) {
      this.opcode('stringLiteral', string.stringModeValue);
    };

    HydrationOpcodeCompiler.prototype.BOOLEAN = function(boolean) {
      this.opcode('literal', boolean.stringModeValue);
    };

    HydrationOpcodeCompiler.prototype.INTEGER = function(integer) {
      this.opcode('literal', integer.stringModeValue);
    };

    function processParams(compiler, params) {
      params.forEach(function(param) {
        if (param.type === 'text') {
          compiler.STRING({ stringModeValue: param.chars });
        } else if (param.type) {
          compiler[param.type](param);
        } else {
          compiler.STRING({ stringModeValue: param });
        }
      });
    }

    function processHash(compiler, hash) {
      if (hash) {
        hash.pairs.forEach(function(pair) {
          var name = pair[0], param = pair[1];
          compiler[param.type](param);
          compiler.opcode('stackLiteral', name);
        });
        compiler.opcode('stackLiteral', hash.pairs.length);
      } else {
        compiler.opcode('stackLiteral', 0);
      }
    }

    function distributePlaceholders(placeholders, opcodes) {
      if (placeholders.length === 0) {
        return;
      }

      // Splice placeholders after the most recent shareParent/consumeParent.
      var o;
      for (o = opcodes.length - 1; o >= 0; --o) {
        var opcode = opcodes[o][0];
        if (opcode === 'shareParent' || opcode === 'consumeParent' || opcode === 'popParent') {
          break;
        }
      }

      var spliceArgs = [o + 1, 0];
      for (var i = 0; i < placeholders.length; ++i) {
        var p = placeholders[i];
        spliceArgs.push(['placeholder', [p[0], p[1], p[2], p[3]]]);
      }
      opcodes.splice.apply(opcodes, spliceArgs);
      placeholders.length = 0;
    }

    __exports__.HydrationOpcodeCompiler = HydrationOpcodeCompiler;
  });
define("htmlbars/compiler/quoting",
  ["exports"],
  function(__exports__) {
    "use strict";
    function escapeString(str) {
      return str.replace(/"/g, '\\"').replace(/\n/g, "\\n");
    }

    __exports__.escapeString = escapeString;

    function string(str) {
      return '"' + escapeString(str) + '"';
    }

    __exports__.string = string;

    function array(a) {
      return "[" + a + "]";
    }

    __exports__.array = array;

    function quotedArray(list) {
      return array(list.map(string).join(", "));
    }

    __exports__.quotedArray = quotedArray;function hash(pairs) {
      return "{" + pairs.join(",") + "}";
    }

    __exports__.hash = hash;
  });
define("htmlbars/compiler/template",
  ["./fragment_opcode","./fragment","./hydration_opcode","./hydration","./ast_walker","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
    "use strict";
    var FragmentOpcodeCompiler = __dependency1__.FragmentOpcodeCompiler;
    var FragmentCompiler = __dependency2__.FragmentCompiler;
    var HydrationOpcodeCompiler = __dependency3__.HydrationOpcodeCompiler;
    var HydrationCompiler = __dependency4__.HydrationCompiler;
    var ASTWalker = __dependency5__.ASTWalker;

    function TemplateCompiler() {
      this.fragmentOpcodeCompiler = new FragmentOpcodeCompiler();
      this.fragmentCompiler = new FragmentCompiler();
      this.hydrationOpcodeCompiler = new HydrationOpcodeCompiler();
      this.hydrationCompiler = new HydrationCompiler();
      this.templates = [];
      this.childTemplates = [];
    }

    __exports__.TemplateCompiler = TemplateCompiler;TemplateCompiler.prototype.compile = function(ast) {
      var astWalker = new ASTWalker(this);
      astWalker.visit(ast);
      return this.templates.pop();
    };

    TemplateCompiler.prototype.startTemplate = function(program, childTemplateCount) {
      this.fragmentOpcodeCompiler.startTemplate(program, childTemplateCount);
      this.hydrationOpcodeCompiler.startTemplate(program, childTemplateCount);

      this.childTemplates.length = 0;
      while(childTemplateCount--) {
        this.childTemplates.push(this.templates.pop());
      }
    };

    TemplateCompiler.prototype.endTemplate = function(program) {
      this.fragmentOpcodeCompiler.endTemplate(program);
      this.hydrationOpcodeCompiler.endTemplate(program);

      // function build(dom) { return fragment; }
      var fragmentProgram = this.fragmentCompiler.compile(
        this.fragmentOpcodeCompiler.opcodes
      );

      // function hydrate(fragment) { return mustaches; }
      var hydrationProgram = this.hydrationCompiler.compile(
        this.hydrationOpcodeCompiler.opcodes
      );

      var childTemplateVars = "";
      for (var i=0, l=this.childTemplates.length; i<l; i++) {
        childTemplateVars +=   '  var child' + i + '=' + this.childTemplates[i] + ';\n';
      }

      var template =
        '(function (){\n' +
          childTemplateVars +
          fragmentProgram +
        'var cachedFragment = null;\n' +
        'return function template(context, options) {\n' +
        '  if (cachedFragment === null) {\n' +
        '    cachedFragment = build(dom);\n' +
        '  }\n' +
        '  var fragment = cachedFragment.cloneNode(true);\n' +
        '  var helpers = options && options.helpers || {};\n' +
           hydrationProgram +
        '  return fragment;\n' +
        '};\n' +
        '}())';

      this.templates.push(template);
    };

    TemplateCompiler.prototype.openElement = function(element, i, l, c) {
      this.fragmentOpcodeCompiler.openElement(element, i, l, c);
      this.hydrationOpcodeCompiler.openElement(element, i, l, c);
    };

    TemplateCompiler.prototype.closeElement = function(element, i, l) {
      this.fragmentOpcodeCompiler.closeElement(element, i, l);
      this.hydrationOpcodeCompiler.closeElement(element, i, l);
    };

    TemplateCompiler.prototype.block = function(block, i, l) {
      this.fragmentOpcodeCompiler.block(block, i, l);
      this.hydrationOpcodeCompiler.block(block, i, l);
    };

    TemplateCompiler.prototype.text = function(string, i, l) {
      this.fragmentOpcodeCompiler.text(string, i, l);
      this.hydrationOpcodeCompiler.text(string, i, l);
    };

    TemplateCompiler.prototype.node = function (node, i, l) {
      this.fragmentOpcodeCompiler.node(node, i, l);
      this.hydrationOpcodeCompiler.node(node, i, l);
    };
  });
define("htmlbars/compiler/utils",
  ["exports"],
  function(__exports__) {
    "use strict";
    function processOpcodes(compiler, opcodes) {
      for (var i=0, l=opcodes.length; i<l; i++) {
        var method = opcodes[i][0];
        var params = opcodes[i][1];
        compiler[method].apply(compiler, params);
      }
    }

    __exports__.processOpcodes = processOpcodes;
  });
define("htmlbars/html-parser/node-handlers",
  ["htmlbars/ast","htmlbars/html-parser/tokens","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var BlockNode = __dependency1__.BlockNode;
    var ProgramNode = __dependency1__.ProgramNode;
    var TextNode = __dependency1__.TextNode;
    var appendChild = __dependency1__.appendChild;
    var Chars = __dependency2__.Chars;

    var nodeHelpers = {

      program: function(program) {
        var statements = [];
        var node = new ProgramNode(statements, program.strip);
        var i, l = program.statements.length;
        var statement;

        this.elementStack.push(node);

        if (l === 0) return this.elementStack.pop();

        statement = program.statements[0];
        if (statement.type === 'block' || statement.type === 'mustache') {
          statements.push(new TextNode(''));
        }

        for (i = 0; i < l; i++) {
          this.acceptNode(program.statements[i]);
        }

        this.acceptToken(this.tokenizer.tokenizeEOF());

        statement = program.statements[l-1];
        if (statement.type === 'block' || statement.type === 'mustache') {
          statements.push(new TextNode(''));
        }

        // Remove any stripped whitespace
        l = statements.length;
        for (i = 0; i < l; i++) {
          statement = statements[i];
          if (statement.type !== 'text') continue;

          if ((i > 0 && statements[i-1].strip && statements[i-1].strip.right) ||
            (i === 0 && program.strip.left)) {
            statement.chars = statement.chars.replace(/^\s+/, '');
          }

          if ((i < l-1 && statements[i+1].strip && statements[i+1].strip.left) ||
            (i === l-1 && program.strip.right)) {
            statement.chars = statement.chars.replace(/\s+$/, '');
          }

          // Remove unnecessary text nodes
          if (statement.chars.length === 0) {
            if ((i > 0 && statements[i-1].type === 'element') ||
              (i < l-1 && statements[i+1].type === 'element')) {
              statements.splice(i, 1);
              i--;
              l--;
            }
          }
        }

        // Ensure that that the element stack is balanced properly.
        var poppedNode = this.elementStack.pop();
        if (poppedNode !== node) {
          throw new Error("Unclosed element: " + poppedNode.tag);
        }

        return node;
      },

      block: function(block) {
        switchToHandlebars(this);
        this.acceptToken(block);

        var mustache = block.mustache;
        var program = this.acceptNode(block.program);
        var inverse = block.inverse ? this.acceptNode(block.inverse) : null;
        var strip = block.strip;

        // Normalize inverse's strip
        if (inverse && !inverse.strip.left) {
          inverse.strip.left = false;
        }

        var node = new BlockNode(mustache, program, inverse, strip);
        var parentProgram = this.currentElement();
        appendChild(parentProgram, node);
      },

      content: function(content) {
        var tokens = this.tokenizer.tokenizePart(content.string);

        return tokens.forEach(function(token) {
          this.acceptToken(token);
        }, this);
      },

      mustache: function(mustache) {
        switchToHandlebars(this);
        this.acceptToken(mustache);
      }

    };

    function switchToHandlebars(processor) {
      var token = processor.tokenizer.token;

      // TODO: Monkey patch Chars.addChar like attributes
      if (token instanceof Chars) {
        processor.acceptToken(token);
        processor.tokenizer.token = null;
      }
    }

    __exports__["default"] = nodeHelpers;
  });
define("htmlbars/html-parser/token-handlers",
  ["htmlbars/ast","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ElementNode = __dependency1__.ElementNode;
    var TextNode = __dependency1__.TextNode;
    var appendChild = __dependency1__.appendChild;

    // This table maps from the state names in the tokenizer to a smaller
    // number of states that control how mustaches are handled
    var states = {
      "beforeAttributeValue": "before-attr",
      "attributeValueDoubleQuoted": "attr",
      "attributeValueSingleQuoted": "attr",
      "attributeValueUnquoted": "attr",
      "beforeAttributeName": "in-tag"
    };

    var voidTagNames = "area base br col command embed hr img input keygen link meta param source track wbr";
    var voidMap = {};

    voidTagNames.split(" ").forEach(function(tagName) {
      voidMap[tagName] = true;
    });

    // Except for `mustache`, all tokens are only allowed outside of
    // a start or end tag.
    var tokenHandlers = {

      Chars: function(token) {
        var current = this.currentElement();
        var text = new TextNode(token.chars);
        appendChild(current, text);
      },

      StartTag: function(tag) {
        var element = new ElementNode(tag.tagName, tag.attributes, tag.helpers || [], []);
        this.elementStack.push(element);
        if (voidMap.hasOwnProperty(tag.tagName)) {
          tokenHandlers.EndTag.call(this, tag);
        }
      },

      block: function(block) {
        if (this.tokenizer.state !== 'data') {
          throw new Error("A block may only be used inside an HTML element or another block.");
        }
      },

      mustache: function(mustache) {
        var state = this.tokenizer.state;
        var token = this.tokenizer.token;

        switch(states[state]) {
          case "before-attr":
            this.tokenizer.state = 'attributeValueUnquoted';
            token.addToAttributeValue(mustache);
            return;
          case "attr":
            token.addToAttributeValue(mustache);
            return;
          case "in-tag":
            token.addTagHelper(mustache);
            return;
          default:
            appendChild(this.currentElement(), mustache);
        }
      },

      EndTag: function(tag) {
        var current = this.currentElement();

        if (current.tag !== tag.tagName) {
          throw new Error("Closing tag " + tag.tagName + " did not match last open tag " + current.tag);
        }

        this.elementStack.pop();
        appendChild(this.currentElement(), current);
      }

    };

    __exports__["default"] = tokenHandlers;
  });
define("htmlbars/html-parser/tokens",
  ["simple-html-tokenizer","htmlbars/ast","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var Chars = __dependency1__.Chars;
    var StartTag = __dependency1__.StartTag;
    var EndTag = __dependency1__.EndTag;
    var AttrNode = __dependency2__.AttrNode;
    var TextNode = __dependency2__.TextNode;
    var MustacheNode = __dependency2__.MustacheNode;
    var StringNode = __dependency2__.StringNode;
    var IdNode = __dependency2__.IdNode;

    StartTag.prototype.startAttribute = function(char) {
      this.finalizeAttributeValue();
      this.currentAttribute = new AttrNode(char.toLowerCase(), []);
      this.attributes.push(this.currentAttribute);
    };

    StartTag.prototype.addToAttributeName = function(char) {
      this.currentAttribute.name += char;
    };

    StartTag.prototype.addToAttributeValue = function(char) {
      var value = this.currentAttribute.value;

      if (char.type === 'mustache') {
        value.push(char);
      } else {
        if (value.length > 0 && value[value.length - 1].type === 'text') {
          value[value.length - 1].chars += char;
        } else {
          value.push(new TextNode(char));
        }
      }
    };

    StartTag.prototype.finalize = function() {
      this.finalizeAttributeValue();
      delete this.currentAttribute;
      return this;
    };

    StartTag.prototype.finalizeAttributeValue = function() {
      var attr = this.currentAttribute;

      if (!attr) return;

      if (attr.value.length === 1) {
        // Unwrap a single TextNode or MustacheNode
        attr.value = attr.value[0];
      } else {
        var params = [ new IdNode([{ part: 'CONCAT' }]) ];

        for (var i = 0; i < attr.value.length; i++) {
          var part = attr.value[i];
          if (part.type === 'text') {
            params.push(new StringNode(part.chars));
          } else if (part.type === 'mustache') {
            var sexpr = part.sexpr;
            delete sexpr.isRoot;

            if (sexpr.isHelper) {
              sexpr.isHelper = true;
            }

            params.push(sexpr);
          }
        }

        attr.value = new MustacheNode(params, undefined, true, { left: false, right: false });
      }
    };

    StartTag.prototype.addTagHelper = function(helper) {
      var helpers = this.helpers = this.helpers || [];
      helpers.push(helper);
    };

    __exports__.Chars = Chars;
    __exports__.StartTag = StartTag;
    __exports__.EndTag = EndTag;
  });
define("htmlbars/parser",
  ["handlebars","simple-html-tokenizer","htmlbars/html-parser/node-handlers","htmlbars/html-parser/token-handlers","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var Handlebars = __dependency1__["default"];
    var Tokenizer = __dependency2__.Tokenizer;
    var nodeHandlers = __dependency3__["default"];
    var tokenHandlers = __dependency4__["default"];

    function preprocess(html, options) {
      var ast = Handlebars.parse(html);
      var combined = new HTMLProcessor(options || {}).acceptNode(ast);
      return combined;
    }

    __exports__.preprocess = preprocess;function HTMLProcessor(options) {
      this.elementStack = [];
      this.tokenizer = new Tokenizer('');
      this.nodeHandlers = nodeHandlers;
      this.tokenHandlers = tokenHandlers;
    }

    HTMLProcessor.prototype.acceptNode = function(node) {
      return this.nodeHandlers[node.type].call(this, node);
    };

    HTMLProcessor.prototype.acceptToken = function(token) {
      if (token) {
        return this.tokenHandlers[token.type].call(this, token);
      }
    };

    HTMLProcessor.prototype.currentElement = function() {
      return this.elementStack[this.elementStack.length - 1];
    };
  });
define("htmlbars/runtime",
  ["htmlbars/runtime/dom_helpers","htmlbars/runtime/placeholder","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var domHelpers = __dependency1__.domHelpers;
    var Placeholder = __dependency2__.Placeholder;

    function hydrate(spec, options) {
      return spec(domHelpers(options && options.extensions), Placeholder);
    }

    __exports__.hydrate = hydrate;
  });
define("htmlbars/runtime/dom_helpers",
  ["htmlbars/utils","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var merge = __dependency1__.merge;

    function domHelpers(extensions) {
      var base = {
        appendText: function(element, text) {
          element.appendChild(document.createTextNode(text));
        },

        setAttribute: function(element, name, value) {
          element.setAttribute(name, value);
        },

        createElement: function(tagName) {
          return document.createElement(tagName);
        },

        createDocumentFragment: function() {
          return document.createDocumentFragment();
        },

        createTextNode: function(text) {
          return document.createTextNode(text);
        }
      };

      return extensions ? merge(extensions, base) : base;
    }

    __exports__.domHelpers = domHelpers;
  });
define("htmlbars/runtime/helpers",
  ["handlebars/safe-string","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var SafeString = __dependency1__["default"];

    function CONTENT(placeholder, helperName, context, params, options) {
      var value, helper = this.LOOKUP_HELPER(helperName, context, options);
      if (helper) {
        value = helper(context, params, options);
      } else {
        value = this.SIMPLE(context, helperName, options);
      }
      if (!options.escaped) {
        value = new SafeString(value);
      }
      placeholder.update(value);
    }

    __exports__.CONTENT = CONTENT;function ELEMENT(element, helperName, context, params, options) {
      var helper = this.LOOKUP_HELPER(helperName, context, options);
      if (helper) {
        options.element = element;
        helper(context, params, options);
      }
    }

    __exports__.ELEMENT = ELEMENT;function ATTRIBUTE(context, params, options) {
      options.element.setAttribute(params[0], params[1]);
    }

    __exports__.ATTRIBUTE = ATTRIBUTE;function CONCAT(context, params, options) {
      var value = "";
      for (var i = 0, l = params.length; i < l; i++) {
        if (options.types[i] === 'id') {
          value += this.SIMPLE(context, params[i], options);
        } else {
          value += params[i];
        }
      }
      return value;
    }

    __exports__.CONCAT = CONCAT;function SUBEXPR(helperName, context, params, options) {
      var helper = this.LOOKUP_HELPER(helperName, context, options);
      if (helper) {
        return helper(context, params, options);
      } else {
        return this.SIMPLE(context, helperName, options);
      }
    }

    __exports__.SUBEXPR = SUBEXPR;function LOOKUP_HELPER(helperName, context, options) {
      if (helperName === 'ATTRIBUTE') {
        return this.ATTRIBUTE;
      } else if (helperName === 'CONCAT') {
        return this.CONCAT;
      }
    }

    __exports__.LOOKUP_HELPER = LOOKUP_HELPER;function SIMPLE(context, name, options) {
      return context[name];
    }

    __exports__.SIMPLE = SIMPLE;
  });
define("htmlbars/runtime/placeholder",
  ["exports"],
  function(__exports__) {
    "use strict";
    var splice = Array.prototype.splice;

    function Placeholder(parent, start, end) {
      // TODO: this is an internal API, this should be an assert
      if (parent.nodeType === 11) {
        if (start === null || end === null) {
          throw new Error('a fragment parent must have boundary nodes in order to detect insertion');
        }
        this.element = null;
      } else {
        this.element = parent;
      }
      this._parent = parent;
      this.start = start;
      this.end = end;
      this.text = null;
      this.owner = null;
      this.placeholders = null;
      this.before = null;
      this.after = null;
      this.escaped = true;
    }

    __exports__.Placeholder = Placeholder;Placeholder.create = function (parent, startIndex, endIndex) {
      var childNodes = parent.childNodes,
        start = startIndex === -1 ? null : childNodes[startIndex],
        end = endIndex === -1 ? null : childNodes[endIndex];
      return new Placeholder(parent, start, end);
    };

    Placeholder.prototype.parent = function () {
      if (!this.element && this._parent !== this.start.parentNode) {
        this.element = this._parent = this.start.parentNode;
      }
      return this._parent;
    };

    Placeholder.prototype.destroy = function () {
      if (this.owner) {
        this.owner.removePlaceholder(this);
      } else {
        clear(this.element || this.parent(), this.start, this.end);
      }
    };

    Placeholder.prototype.removePlaceholder = function (placeholder) {
      var placeholders = this.placeholders;
      for (var i=0, l=placeholders.length; i<l; i++) {
        if (placeholders[i] === placeholder) {
          this.replace(i, 1);
          break;
        }
      }
    };

    Placeholder.prototype.update = function (nodeOrString) {
      this._update(this.element || this.parent(), nodeOrString);
    };

    Placeholder.prototype.updateNode = function (node) {
      var parent = this.element || this.parent();
      if (!node) return this._updateText(parent, '');
      this._updateNode(parent, node);
    };

    Placeholder.prototype.updateText = function (text) {
      this._updateText(this.element || this.parent(), text);
    };

    Placeholder.prototype.updateHTML = function (html) {
      var parent = this.element || this.parent();
      if (!html) return this._updateText(parent, '');
      this._updateHTML(parent, html);
    };

    Placeholder.prototype._update = function (parent, nodeOrString) {
      if (nodeOrString === null || nodeOrString === undefined) {
        this._updateText(parent, '');
      } else if (typeof nodeOrString === 'string') {
        if (this.escaped) {
          this._updateText(parent, nodeOrString);
        } else {
          this._updateHTML(parent, nodeOrString);
        }
      } else if (nodeOrString.nodeType) {
        this._updateNode(parent, nodeOrString);
      } else if (nodeOrString.string) { // duck typed SafeString
        this._updateHTML(parent, nodeOrString.string);
      } else {
        this._updateText(parent, nodeOrString.toString());
      }
    };

    Placeholder.prototype._updateNode = function (parent, node) {
      if (this.text) {
        if (node.nodeType === 3) {
          this.text.nodeValue = node.nodeValue;
          return;
        } else {
          this.text = null;
        }
      }
      var start = this.start, end = this.end;
      clear(parent, start, end);
      parent.insertBefore(node, end);
      if (this.before !== null) {
        this.before.end = start.nextSibling;
      }
      if (this.after !== null) {
        this.after.start = end.previousSibling;
      }
    };

    Placeholder.prototype._updateText = function (parent, text) {
      if (this.text) {
        this.text.nodeValue = text;
        return;
      }
      var node = parent.ownerDocument.createTextNode(text);
      this.text = node;
      clear(parent, this.start, this.end);
      parent.insertBefore(node, this.end);
      if (this.before !== null) {
        this.before.end = node;
      }
      if (this.after !== null) {
        this.after.start = node;
      }
    };

    Placeholder.prototype._updateHTML = function (parent, html) {
      var start = this.start, end = this.end;
      clear(parent, start, end);
      this.text = null;
      var element;
      if (parent.nodeType === 11) {
        /* TODO require templates always have a contextual element
           instead of element0 = frag */
        element = parent.ownerDocument.createElement('div');
      } else {
        element = parent.cloneNode(false);
      }
      element.innerHTML = html;
      appendChildren(parent, end, element.childNodes);
      if (this.before !== null) {
        this.before.end = start.nextSibling;
      }
      if (this.after !== null) {
        this.after.start = end.previousSibling;
      }
    };

    Placeholder.prototype.replace = function (index, removedLength, addedNodes) {
      if (this.placeholders === null) this.placeholders = [];
      var parent = this.element || this.parent(),
        placeholders = this.placeholders,
        before = index > 0 ? placeholders[index-1] : null,
        after = index+removedLength < placeholders.length ? placeholders[index+removedLength] : null,
        start = before === null ? this.start : (before.end === null ? parent.lastChild : before.end.previousSibling),
        end   = after === null ? this.end : (after.start === null ? parent.firstChild : after.start.nextSibling),
        addedLength = addedNodes === undefined ? 0 : addedNodes.length,
        args, i, current;

      if (removedLength > 0) {
        clear(parent, start, end);
      }

      if (addedLength === 0) {
        if (before !== null) {
          before.after = after;
          before.end = end;
        }
        if (after !== null) {
          after.before = before;
          after.start = start;
        }
        placeholders.splice(index, removedLength);
        return;
      }

      args = new Array(addedLength+2);
      if (addedLength > 0) {
        for (i=0; i<addedLength; i++) {
          args[i+2] = current = new Placeholder(parent, start, end);
          current._update(parent, addedNodes[i]);
          current.owner = this;
          if (before !== null) {
            current.before = before;
            before.end = start.nextSibling;
            before.after = current;
          }
          before = current;
          start = end === null ? parent.lastChild : end.previousSibling;
        }
        if (after !== null) {
          current.after = after;
          after.start = end.previousSibling;
        }
      }

      args[0] = index;
      args[1] = removedLength;

      splice.apply(placeholders, args);
    };

    function appendChildren(parent, end, nodeList) {
      var ref = end,
          i = nodeList.length,
          node;
      while (i--) {
        node = nodeList[i];
        parent.insertBefore(node, ref);
        ref = node;
      }
    }

    function clear(parent, start, end) {
      var current, previous;
      if (end === null) {
        current = parent.lastChild;
      } else {
        current = end.previousSibling;
      }

      while (current !== null && current !== start) {
        previous = current.previousSibling;
        parent.removeChild(current);
        current = previous;
      }
    }
  });
define("htmlbars/tests/ast_walker_test",
  ["htmlbars/parser","htmlbars/compiler/ast_walker"],
  function(__dependency1__, __dependency2__) {
    "use strict";
    var preprocess = __dependency1__.preprocess;
    var ASTWalker = __dependency2__.ASTWalker;

    module("ASTWalker");

    test("visits ast in an order friendly to opcode generation", function () {
      var input = "A{{#if}}B{{#block}}C{{/block}}{{#block}}D{{/block}}{{else}}E{{#block}}F{{/block}}{{/if}}<div>G{{#block}}H{{gnarly}}{{/block}}<span>{{woot}}{{foo}}</span><em></em><a><em {{foo}}>{{bar}}</em></a><em {{baz}}></em><a {{foo}} {{bar}}></a></div>{{bar}}";
      var expected = "[0: [0: 'C' 1: 'D'] 'B{{0}}{{1}}' 1: [0: 'F'] 'E{{0}}' 2: 'H'] 'A{{0,1}}<div 5>G{{2}}<span 2></span><em 0></em><a 1><em 2></em></a><em 1></em><a 2></a></div>'";

      var ast = preprocess(input);

      var visitor = {
        opcodes: [],
        templateId: 0,
        startTemplate: function (program, childTemplateCount) {
          this.templateId = 0;
          this.opcodes.push(['startTemplate', childTemplateCount]);
        },
        endTemplate: function () {
          this.opcodes.push(['pushTemplate']);
        },
        openElement: function (element, a, b, mustacheCount) {
          this.opcodes.push(['openTag', element.tag, mustacheCount]);
        },
        text: function (text) {
          this.opcodes.push(['text', text.chars]);
        },
        closeElement: function (element) {
          this.opcodes.push(['closeTag', element.tag]);
        },
        block: function (block) {
          this.opcodes.push(['block', this.templateId++, block.inverse === null ? null : this.templateId++]);
        },
        node: function (node) { }
      };

      var walker = new ASTWalker(visitor);
      walker.visit(ast);

      var compiler = {
        stack: [],
        template: null,
        startTemplate: function (childCount) {
          this.template = '';
          var childId = 0, child;
          if (childCount > 0) {
            this.template += '[';
            while (childCount--) {
              child = this.stack.pop();
              if (childId > 0) this.template += ' ';
              this.template += '' + childId++ + ': ' + child;
            }
            this.template += '] ';
          }
          this.template += "'";
        },
        pushTemplate: function () {
          this.template += "'";
          this.stack.push(this.template);
        },
        openTag: function (tag, mustacheCount) {
          this.template += '<' + tag + ' ' + mustacheCount + '>';
        },
        closeTag: function (tag) {
          this.template += '</' + tag + '>';
        },
        text: function (str) {
          this.template += str;
        },
        block: function (programId, inverseId) {
          this.template += '{{' + programId;
          if (inverseId !== null) {
            this.template += ',' + inverseId;
          }

          this.template += '}}';
        },
        compile: function (opcodes) {
          var opcode;
          for (var i=0; i<opcodes.length; i++) {
            opcode = opcodes[i];
            this[opcode[0]].apply(this, opcode.slice(1));
          }
          return this.stack.pop();
        }
      };

      var output = compiler.compile(visitor.opcodes);

      equal(output, expected);
    });
  });
define("htmlbars/tests/combined_ast_test",
  ["htmlbars/parser","htmlbars/ast"],
  function(__dependency1__, __dependency2__) {
    "use strict";
    var preprocess = __dependency1__.preprocess;
    var ProgramNode = __dependency2__.ProgramNode;
    var BlockNode = __dependency2__.BlockNode;
    var ElementNode = __dependency2__.ElementNode;
    var MustacheNode = __dependency2__.MustacheNode;
    var SexprNode = __dependency2__.SexprNode;
    var HashNode = __dependency2__.HashNode;
    var IdNode = __dependency2__.IdNode;
    var StringNode = __dependency2__.StringNode;
    var AttrNode = __dependency2__.AttrNode;
    var TextNode = __dependency2__.TextNode;

    module("HTML-based compiler (AST)");

    var stripLeft = { left: true, right: false };
    var stripRight = { left: false, right: true };
    var stripBoth = { left: true, right: true };
    var stripNone = { left: false, right: false };

    function id(string) {
      return new IdNode([{ part: string }]);
    }

    function sexpr(params, hash) {
      var sexprNode = new SexprNode(params, hash || undefined);
      if (sexprNode.isHelper) {
        sexprNode.isHelper = true;
      }
      return sexprNode;
    }

    function hash(pairs) {
      return pairs ? new HashNode(pairs) : undefined;
    }

    function mustache(string, pairs, strip, raw) {
      var params;

      if (({}).toString.call(string) === '[object Array]') {
        params = string;
      } else {
        params = [id(string)];
      }

      return new MustacheNode(params, hash(pairs), raw ? '{{{' : '{{', strip || stripNone);
    }

    function concat(params) {
      return mustache([id('CONCAT')].concat(params));
    }

    function string(data) {
      return new StringNode(data);
    }

    function element(tagName, a, b, c) {
      var l = arguments.length;
      if (l == 2) return new ElementNode(tagName, [], [], a);
      if (l == 3) return new ElementNode(tagName, a, [], b);
      if (l == 4) return new ElementNode(tagName, a, b, c);
    }

    function attr(name, value) {
      return new AttrNode(name, value);
    }

    function text(chars) {
      return new TextNode(chars);
    }

    function block(mustache, program, inverse, strip) {
      return new BlockNode(mustache, program, inverse || null, strip || stripNone);
    }

    function program(children, strip) {
      return new ProgramNode(children || [], strip || stripNone);
    }

    function root(children) {
      return program(children || [], {});
    }

    function removeLocInfo(obj) {
      delete obj.firstColumn;
      delete obj.firstLine;
      delete obj.lastColumn;
      delete obj.lastLine;

      for (var k in obj) {
        if (obj.hasOwnProperty(k) && obj[k] && typeof obj[k] === 'object') {
          removeLocInfo(obj[k]);
        }
      }
    }

    function astEqual(template, expected, message) {
      // Perform a deepEqual but recursively remove the locInfo stuff
      // (e.g. line/column information about the compiled template)
      // that we don't want to have to write into our test cases.
      var actual = preprocess(template);
      removeLocInfo(actual);
      removeLocInfo(expected);

      deepEqual(actual, expected, message);
    }

    test("a simple piece of content", function() {
      var t = 'some content';
      astEqual(t, root([
        text('some content')
      ]));
    });

    test("a piece of content with HTML", function() {
      var t = 'some <div>content</div> done';
      astEqual(t, root([
        text("some "),
        element("div", [
          text("content")
        ]),
        text(" done")
      ]));
    });

    test("a piece of Handlebars with HTML", function() {
      var t = 'some <div>{{content}}</div> done';
      astEqual(t, root([
        text("some "),
        element("div", [
          mustache('content')
        ]),
        text(" done")
      ]));
    });

    test("Handlebars embedded in an attribute", function() {
      var t = 'some <div class="{{foo}}">content</div> done';
      astEqual(t, root([
        text("some "),
        element("div", [ attr("class", mustache('foo')) ], [
          text("content")
        ]),
        text(" done")
      ]));
    });

    test("Handlebars embedded in an attribute (sexprs)", function() {
      var t = 'some <div class="{{foo (foo "abc")}}">content</div> done';
      astEqual(t, root([
        text("some "),
        element("div", [
          attr("class", mustache([id('foo'), sexpr([id('foo'), string('abc')])]))
        ], [
          text("content")
        ]),
        text(" done")
      ]));
    });


    test("Handlebars embedded in an attribute with other content surrounding it", function() {
      var t = 'some <a href="http://{{link}}/">content</a> done';
      astEqual(t, root([
        text("some "),
        element("a", [
          attr("href", concat([
            string("http://"),
            sexpr([id('link')]),
            string("/")
          ]))
        ], [
          text("content")
        ]),
        text(" done")
      ]));
    });

    test("A more complete embedding example", function() {
      var t = "{{embed}} {{some 'content'}} " +
              "<div class='{{foo}} {{bind-class isEnabled truthy='enabled'}}'>{{ content }}</div>" +
              " {{more 'embed'}}";
      astEqual(t, root([
        text(''),
        mustache('embed'),
        text(' '),
        mustache([id('some'), string('content')]),
        text(' '),
        element("div", [
          attr("class", concat([
            sexpr([id('foo')]),
            string(' '),
            sexpr([id('bind-class'), id('isEnabled')], hash([['truthy', string('enabled')]]))
          ]))
        ], [
          mustache('content')
        ]),
        text(' '),
        mustache([id('more'), string('embed')]),
        text('')
      ]));
    });

    test("Simple embedded block helpers", function() {
      var t = "{{#if foo}}<div>{{content}}</div>{{/if}}";
      astEqual(t, root([
        text(''),
        block(mustache([id('if'), id('foo')]), program([
          element('div', [
            mustache('content')
          ])
        ])),
        text('')
      ]));
    });

    test("Involved block helper", function() {
      var t = '<p>hi</p> content {{#testing shouldRender}}<p>Appears!</p>{{/testing}} more <em>content</em> here';
      astEqual(t, root([
        element('p', [
          text('hi')
        ]),
        text(' content '),
        block(mustache([id('testing'), id('shouldRender')]), program([
          element('p', [
            text('Appears!')
          ])
        ])),
        text(' more '),
        element('em', [
          text('content')
        ]),
        text(' here')
      ]));
    });

    test("Node helpers", function() {
      var t = "<p {{action 'boom'}} class='bar'>Some content</p>";
      astEqual(t, root([
        element('p', [attr('class', text('bar'))], [mustache([id('action'), string('boom')])], [
          text('Some content')
        ])
      ]));
    });

    test('Auto insertion of text nodes between blocks and mustaches', function () {
      var t = "{{one}}{{two}}{{#three}}{{/three}}{{#four}}{{/four}}{{five}}";
      astEqual(t, root([
        text(''),
        mustache([id('one')]),
        text(''),
        mustache([id('two')]),
        text(''),
        block(mustache([id('three')]), program()),
        text(''),
        block(mustache([id('four')]), program()),
        text(''),
        mustache([id('five')]),
        text('')
      ]));
    });

    test("Stripping - mustaches", function() {
      var t = "foo {{~content}} bar";
      astEqual(t, root([
        text('foo'),
        mustache([id('content')], null, stripLeft),
        text(' bar')
      ]));

      t = "foo {{content~}} bar";
      astEqual(t, root([
        text('foo '),
        mustache([id('content')], null, stripRight),
        text('bar')
      ]));
    });

    test("Stripping - blocks", function() {
      var t = "foo {{~#wat}}{{/wat}} bar";
      astEqual(t, root([
        text('foo'),
        block(mustache([id('wat')], null, stripLeft), program(), null, stripLeft),
        text(' bar')
      ]));

      t = "foo {{#wat}}{{/wat~}} bar";
      astEqual(t, root([
        text('foo '),
        block(mustache([id('wat')]), program(), null, stripRight),
        text('bar')
      ]));
    });


    test("Stripping - programs", function() {
      var t = "{{#wat~}} foo {{else}}{{/wat}}";
      astEqual(t, root([
        text(''),
        block(mustache([id('wat')], null, stripRight), program([
          text('foo ')
        ], stripLeft), program()),
        text('')
      ]));

      t = "{{#wat}} foo {{~else}}{{/wat}}";
      astEqual(t, root([
        text(''),
        block(mustache([id('wat')]), program([
          text(' foo')
        ], stripRight), program()),
        text('')
      ]));

      t = "{{#wat}}{{else~}} foo {{/wat}}";
      astEqual(t, root([
        text(''),
        block(mustache([id('wat')]), program(), program([
          text('foo ')
        ], stripLeft)),
        text('')
      ]));

      t = "{{#wat}}{{else}} foo {{~/wat}}";
      astEqual(t, root([
        text(''),
        block(mustache([id('wat')]), program(), program([
          text(' foo')
        ], stripRight)),
        text('')
      ]));
    });

    test("Stripping - removes unnecessary text nodes", function() {
      var t = "{{#each~}}\n  <li> foo </li>\n{{~/each}}";
      astEqual(t, root([
        text(''),
        block(mustache([id('each')], null, stripRight), program([
          element('li', [text(' foo ')])
        ], stripBoth)),
        text('')
      ]));
    });


    test("Mustache in unquoted attribute value", function() {
      var t = "<div class=a{{foo}}></div>";
      astEqual(t, root([
        element('div', [ attr('class', concat([string("a"), sexpr([id('foo')])])) ], [])
      ]));

      t = "<div class={{foo}}></div>";
      astEqual(t, root([
        element('div', [ attr('class', mustache('foo')) ], [])
      ]));

      t = "<div class=a{{foo}}b></div>";
      astEqual(t, root([
        element('div', [ attr('class', concat([string("a"), sexpr([id('foo')]), string("b")])) ], [])
      ]));

      t = "<div class={{foo}}b></div>";
      astEqual(t, root([
        element('div', [ attr('class', concat([sexpr([id('foo')]), string("b")])) ], [])
      ]));
    });
  });
define("htmlbars/tests/fragment_test",
  ["htmlbars/compiler/fragment_opcode","htmlbars/compiler/hydration_opcode","htmlbars/compiler/fragment","htmlbars/compiler/hydration","htmlbars/runtime/dom_helpers","htmlbars/runtime/placeholder","htmlbars/parser"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__) {
    "use strict";
    var FragmentOpcodeCompiler = __dependency1__.FragmentOpcodeCompiler;
    var HydrationOpcodeCompiler = __dependency2__.HydrationOpcodeCompiler;
    var FragmentCompiler = __dependency3__.FragmentCompiler;
    var HydrationCompiler = __dependency4__.HydrationCompiler;
    var domHelpers = __dependency5__.domHelpers;
    var Placeholder = __dependency6__.Placeholder;
    var preprocess = __dependency7__.preprocess;

    function equalHTML(fragment, html) {
      var div = document.createElement("div");
      div.appendChild(fragment.cloneNode(true));

      QUnit.push(div.innerHTML === html, div.innerHTML, html);
    }

    var dom = domHelpers();

    function fragmentFor(ast) {
      /* jshint evil: true */
      var fragmentOpcodeCompiler = new FragmentOpcodeCompiler(),
          fragmentCompiler = new FragmentCompiler();

      var opcodes = fragmentOpcodeCompiler.compile(ast);
      var program = fragmentCompiler.compile(opcodes);

      var fn = new Function('return ' + program)();

      return fn( dom );
    }

    function hydratorFor(ast) {
      /* jshint evil: true */
      var hydrate = new HydrationOpcodeCompiler();
      var opcodes = hydrate.compile(ast);
      var hydrate2 = new HydrationCompiler();
      var program = hydrate2.compile(opcodes, []);
      return new Function("Placeholder", "fragment", "context", "helpers", program);
    }

    module('fragment');

    test('compiles a fragment', function () {
      var ast = preprocess("<div>{{foo}} bar {{baz}}</div>");
      var fragment = fragmentFor(ast);

      equalHTML(fragment, "<div> bar </div>");
    });

    test('converts entities to their char/string equivalent', function () {
      var ast = preprocess("<div title=\"&quot;Foo &amp; Bar&quot;\">lol &lt; &#60;&#x3c; &#x3C; &LT; &NotGreaterFullEqual; &Borksnorlax;</div>");
      var fragment = fragmentFor(ast);

      equal(fragment.getAttribute('title'), '"Foo & Bar"');
      equal(fragment.textContent, "lol < << < < ≧̸ &Borksnorlax;");
    });

    test('hydrates a fragment with placeholder mustaches', function () {
      var ast = preprocess("<div>{{foo \"foo\" 3 blah bar=baz ack=\"syn\"}} bar {{baz}}</div>");
      var fragment = fragmentFor(ast).cloneNode(true);
      var hydrate = hydratorFor(ast);

      var contentResolves = [];
      var context = {};
      var helpers = {
        CONTENT: function(placeholder, path, context, params, options) {
          contentResolves.push({
            placeholder: placeholder,
            context: context,
            path: path,
            params: params,
            options: options
          });
        }
      };

      hydrate(Placeholder, fragment, context, helpers);

      equal(contentResolves.length, 2);

      var foo = contentResolves[0];
      equal(foo.placeholder.parent(), fragment);
      equal(foo.context, context);
      equal(foo.path, 'foo');
      deepEqual(foo.params, ["foo",3,"blah"]);
      deepEqual(foo.options.types, ["string","number","id"]);
      deepEqual(foo.options.hash, {ack:"syn",bar:"baz"});
      deepEqual(foo.options.hashTypes, {ack:"string",bar:"id"});
      equal(foo.options.escaped, true);

      var baz = contentResolves[1];
      equal(baz.placeholder.parent(), fragment);
      equal(baz.context, context);
      equal(baz.path, 'baz');
      equal(baz.params.length, 0);
      equal(baz.options.escaped, true);

      foo.placeholder.update('A');
      baz.placeholder.update('B');

      equalHTML(fragment, "<div>A bar B</div>");
    });

    test('test auto insertion of text nodes for needed edges a fragment with placeholder mustaches', function () {
      var ast = preprocess("{{first}}<p>{{second}}</p>{{third}}");
      var fragment = fragmentFor(ast).cloneNode(true);
      var hydrate = hydratorFor(ast);

      var placeholders = [];
      var FakePlaceholder = {
        create: function (start, startIndex, endIndex) {
          var placeholder = Placeholder.create(start, startIndex, endIndex);
          placeholders.push(placeholder);
          return placeholder;
        }
      };

      var contentResolves = [];
      var context = {};
      var helpers = {
        CONTENT: function(placeholder, path, context, params, options) {
          contentResolves.push({
            placeholder: placeholder,
            context: context,
            path: path,
            params: params,
            options: options
          });
        }
      };

      hydrate(FakePlaceholder, fragment, context, helpers);

      equal(placeholders.length, 3);

      var t = placeholders[0].start;
      equal(t.nodeType, 3);
      equal(t.textContent , '');
      equal(placeholders[1].start, null);
      equal(placeholders[1].end, null);

      equal(placeholders[2].start, placeholders[1].parent());
      equal(placeholders[2].end.nodeType, 3);
      equal(placeholders[2].end.textContent, '');

      placeholders[0].update('A');
      placeholders[1].update('B');
      placeholders[2].update('C');

      equalHTML(fragment, "A<p>B</p>C");
    });
  });
define("htmlbars/tests/html_compiler_test",
  ["htmlbars/compiler","simple-html-tokenizer","htmlbars/runtime/helpers"],
  function(__dependency1__, __dependency2__, __dependency3__) {
    "use strict";
    var compile = __dependency1__.compile;
    var tokenize = __dependency2__.tokenize;
    var CONTENT = __dependency3__.CONTENT;
    var ELEMENT = __dependency3__.ELEMENT;
    var ATTRIBUTE = __dependency3__.ATTRIBUTE;
    var CONCAT = __dependency3__.CONCAT;
    var SUBEXPR = __dependency3__.SUBEXPR;
    var SIMPLE = __dependency3__.SIMPLE;

    function frag(element, string) {
      if (element instanceof DocumentFragment) {
        element = document.createElement('div');
      }

      var range = document.createRange();
      range.setStart(element, 0);
      range.collapse(false);
      return range.createContextualFragment(string);
    }

    var hooks, helpers;

    function registerHelper(name, callback) {
      helpers[name] = callback;
    }

    function lookupHelper(helperName, context, options) {
      if (helperName === 'ATTRIBUTE') {
        return this.ATTRIBUTE;
      } else if (helperName === 'CONCAT') {
        return this.CONCAT;
      } else {
        return helpers[helperName];
      }
    }

    module("HTML-based compiler (output)", {
      setup: function() {
        helpers = [];
        hooks = { CONTENT: CONTENT, ELEMENT: ELEMENT, ATTRIBUTE: ATTRIBUTE, CONCAT: CONCAT, SUBEXPR: SUBEXPR, LOOKUP_HELPER: lookupHelper, SIMPLE: SIMPLE };
      }
    });

    function equalHTML(fragment, html) {
      var div = document.createElement("div");

      div.appendChild(fragment.cloneNode(true));

      var fragTokens = tokenize(div.innerHTML);
      var htmlTokens = tokenize(html);

      function normalizeTokens(token) {
        if (token.type === 'StartTag') {
          token.attributes = token.attributes.sort();
        }
      }

      fragTokens.forEach(normalizeTokens);
      htmlTokens.forEach(normalizeTokens);

      deepEqual(fragTokens, htmlTokens);
    }

    test("Simple content produces a document fragment", function() {
      var template = compile("content");
      var fragment = template();

      equalHTML(fragment, "content");
    });

    test("Simple elements are created", function() {
      var template = compile("<h1>hello!</h1><div>content</div>");
      var fragment = template();

      equalHTML(fragment, "<h1>hello!</h1><div>content</div>");
    });

    test("Simple elements can have attributes", function() {
      var template = compile("<div class='foo' id='bar'>content</div>");
      var fragment = template();

      equalHTML(fragment, '<div class="foo" id="bar">content</div>');
    });

    function shouldBeVoid(tagName) {
      var html = "<" + tagName + " data-foo='bar'><p>hello</p>";
      var template = compile(html);
      var fragment = template();


      var div = document.createElement("div");
      div.appendChild(fragment.cloneNode(true));

      var tag = '<' + tagName + ' data-foo="bar">';
      var closing = '</' + tagName + '>';
      var extra = "<p>hello</p>";
      html = div.innerHTML;

      QUnit.push((html === tag + extra) || (html === tag + closing + extra), html, tag + closing + extra, tagName + "should be a void element");
    }

    test("Void elements are self-closing", function() {
      var voidElements = "area base br col command embed hr img input keygen link meta param source track wbr";

      voidElements.split(" ").forEach(function(tagName) {
        shouldBeVoid(tagName);
      });
    });

    test("The compiler can handle nesting", function() {
      var html = '<div class="foo"><p><span id="bar" data-foo="bar">hi!</span></p></div> More content';
      var template = compile(html);
      var fragment = template();

      equalHTML(fragment, html);
    });

    test("The compiler can handle foreign elements", function() {
      var html = '<svg><path stroke="black" d="M 0 0 L 100 100"></path></svg>';
      var template = compile(html);
      var fragment = template();

      equalHTML(fragment, html);
    });

    test("The compiler can handle quotes", function() {
      compilesTo('<div>"This is a title," we\'re on a boat</div>');
    });

    test("The compiler can handle newlines", function() {
      compilesTo("<div>common\n\nbro</div>");
      ok(true);
    });

    function compilesTo(html, expected, context) {
      var template = compile(html);
      var fragment = template(context, {helpers: hooks });

      equalHTML(fragment, expected === undefined ? html : expected);
      return fragment;
    }

    test("The compiler can handle simple handlebars", function() {
      compilesTo('<div>{{title}}</div>', '<div>hello</div>', { title: 'hello' });
    });

    test("The compiler can handle escaping HTML", function() {
      compilesTo('<div>{{title}}</div>', '<div>&lt;strong&gt;hello&lt;/strong&gt;</div>', { title: '<strong>hello</strong>' });
    });

    test("The compiler can handle unescaped HTML", function() {
      compilesTo('<div>{{{title}}}</div>', '<div><strong>hello</strong></div>', { title: '<strong>hello</strong>' });
    });

    test("The compiler can handle simple helpers", function() {
      registerHelper('testing', function(context, params, options) {
        return context[params[0]];
      });

      compilesTo('<div>{{testing title}}</div>', '<div>hello</div>', { title: 'hello' });
    });

    test("The compiler can handle sexpr helpers", function() {
      registerHelper('testing', function(context, params, options) {
        return params[0] + "!";
      });

      compilesTo('<div>{{testing (testing "hello")}}</div>', '<div>hello!!</div>', {});
    });

    test("The compiler can handle multiple invocations of sexprs", function() {
      function evalParam(context, param, type) {
        if (type === 'id') {
          return context[param];
        } else {
          return param;
        }
      }

      registerHelper('testing', function(context, params, options) {
        return evalParam(context, params[0], options.types[0]) +
               evalParam(context, params[1], options.types[1]);
      });

      compilesTo('<div>{{testing (testing "hello" foo) (testing (testing bar "lol") baz)}}</div>', '<div>helloFOOBARlolBAZ</div>', { foo: "FOO", bar: "BAR", baz: "BAZ" });
    });

    test("The compiler tells helpers what kind of expression the path is", function() {
      registerHelper('testing', function(context, params, options) {
        return options.types[0] + '-' + params[0];
      });

      compilesTo('<div>{{testing "title"}}</div>', '<div>string-title</div>');
      compilesTo('<div>{{testing 123}}</div>', '<div>number-123</div>');
      compilesTo('<div>{{testing true}}</div>', '<div>boolean-true</div>');
      compilesTo('<div>{{testing false}}</div>', '<div>boolean-false</div>');
    });

    test("The compiler passes along the hash arguments", function() {
      registerHelper('testing', function(context, params, options) {
        return options.hash.first + '-' + options.hash.second;
      });

      compilesTo('<div>{{testing first="one" second="two"}}</div>', '<div>one-two</div>');
    });

    test("The compiler passes along the types of the hash arguments", function() {
      registerHelper('testing', function(context, params, options) {
        return options.hashTypes.first + '-' + options.hash.first;
      });

      compilesTo('<div>{{testing first="one"}}</div>', '<div>string-one</div>');
      compilesTo('<div>{{testing first=one}}</div>', '<div>id-one</div>');
      compilesTo('<div>{{testing first=1}}</div>', '<div>number-1</div>');
      compilesTo('<div>{{testing first=true}}</div>', '<div>boolean-true</div>');
      compilesTo('<div>{{testing first=false}}</div>', '<div>boolean-false</div>');
    });

    test("It is possible to override the resolution mechanism", function() {
      hooks.SIMPLE = function(context, name, options) {
        if (name === 'zomg') {
          return context.zomg;
        } else {
          return name.replace('.', '-');
        }
      };

      compilesTo('<div>{{foo}}</div>', '<div>foo</div>');
      compilesTo('<div>{{foo.bar}}</div>', '<div>foo-bar</div>');
      compilesTo('<div>{{zomg}}</div>', '<div>hello</div>', { zomg: 'hello' });
    });

    test("Simple data binding using text nodes", function() {
      var callback;

      hooks.CONTENT = function(placeholder, path, context, params, options) {
        callback = function() {
          placeholder.update(context[path]);
        };
        callback();
      };

      var object = { title: 'hello' };
      var fragment = compilesTo('<div>{{title}} world</div>', '<div>hello world</div>', object);

      object.title = 'goodbye';
      callback();

      equalHTML(fragment, '<div>goodbye world</div>');

      object.title = 'brown cow';
      callback();

      equalHTML(fragment, '<div>brown cow world</div>');
    });

    test("Simple data binding on fragments", function() {
      var callback;

      hooks.CONTENT = function(placeholder, path, context, params, options) {
        placeholder.escaped = false;
        callback = function() {
          placeholder.update(context[path]);
        };
        callback();
      };

      var object = { title: '<p>hello</p> to the' };
      var fragment = compilesTo('<div>{{title}} world</div>', '<div><p>hello</p> to the world</div>', object);

      object.title = '<p>goodbye</p> to the';
      callback();

      equalHTML(fragment, '<div><p>goodbye</p> to the world</div>');

      object.title = '<p>brown cow</p> to the';
      callback();

      equalHTML(fragment, '<div><p>brown cow</p> to the world</div>');
    });

    test("CONTENT hook receives escaping information", function() {
      expect(3);

      hooks.CONTENT = function(placeholder, path, context, params, options) {
        if (path === 'escaped') {
          equal(options.escaped, true);
        } else if (path === 'unescaped') {
          equal(options.escaped, false);
        }

        placeholder.update(path);
      };

      // so we NEED a reference to div. because it's passed in twice.
      // not divs childNodes.
      // the parent we need to save is fragment.childNodes
      compilesTo('<div>{{escaped}}-{{{unescaped}}}</div>', '<div>escaped-unescaped</div>');
    });

    test("Helpers receive escaping information", function() {
      expect(3);

      registerHelper('testing', function(context, params, options) {
        if (params[0] === 'escaped') {
          equal(options.escaped, true);
        } else if (params[0] === 'unescaped') {
          equal(options.escaped, false);
        }

        return params[0];
      });

      compilesTo('<div>{{testing escaped}}-{{{testing unescaped}}}</div>', '<div>escaped-unescaped</div>');
    });

    test("Attributes can use computed values", function() {
      compilesTo('<a href="{{url}}">linky</a>', '<a href="linky.html">linky</a>', { url: 'linky.html' });
    });

    test("Mountain range of nesting", function() {
      var context = { foo: "FOO", bar: "BAR", baz: "BAZ", boo: "BOO", brew: "BREW", bat: "BAT", flute: "FLUTE", argh: "ARGH" };
      compilesTo('{{foo}}<span></span>', 'FOO<span></span>', context);
      compilesTo('<span></span>{{foo}}', '<span></span>FOO', context);
      compilesTo('<span>{{foo}}</span>{{foo}}', '<span>FOO</span>FOO', context);
      compilesTo('{{foo}}<span>{{foo}}</span>{{foo}}', 'FOO<span>FOO</span>FOO', context);
      compilesTo('{{foo}}<span></span>{{foo}}', 'FOO<span></span>FOO', context);
      compilesTo('{{foo}}<span></span>{{bar}}<span><span><span>{{baz}}</span></span></span>',
                 'FOO<span></span>BAR<span><span><span>BAZ</span></span></span>', context);
      compilesTo('{{foo}}<span></span>{{bar}}<span>{{argh}}<span><span>{{baz}}</span></span></span>',
                 'FOO<span></span>BAR<span>ARGH<span><span>BAZ</span></span></span>', context);
      compilesTo('{{foo}}<span>{{bar}}<a>{{baz}}<em>{{boo}}{{brew}}</em>{{bat}}</a></span><span><span>{{flute}}</span></span>{{argh}}',
                 'FOO<span>BAR<a>BAZ<em>BOOBREW</em>BAT</a></span><span><span>FLUTE</span></span>ARGH', context);
    });

    // test("Attributes can use computed paths", function() {
    //   compilesTo('<a href="{{post.url}}">linky</a>', '<a href="linky.html">linky</a>', { post: { url: 'linky.html' }});
    // });

    function streamValue(value) {
      return {
        subscribe: function(callback) {
          callback(value);
          return { connect: function() {} };
        }
      };
    }

    function boundValue(valueGetter, binding) {
      var subscription;

      var stream = {
        subscribe: function(next) {
          subscription = next;
          callback();
          return { connect: function() {} };
        }
      };

      return stream;

      function callback() {
        subscription(valueGetter.call(binding, callback));
      }
    }

    test("It is possible to override the resolution mechanism for attributes", function() {
      hooks.ATTRIBUTE = function (context, params, options) {
        options.element.setAttribute(params[0], 'http://google.com/' + params[1]);
      };

      compilesTo('<a href="{{url}}">linky</a>', '<a href="http://google.com/linky.html">linky</a>', { url: 'linky.html' });
    });

    /*

    test("It is possible to use RESOLVE_IN_ATTR for data binding", function() {
      var callback;

      registerHelper('RESOLVE_IN_ATTR', function(parts, options) {
        return boundValue(function(c) {
          callback = c;
          return this[parts[0]];
        }, this);
      });

      var object = { url: 'linky.html' };
      var fragment = compilesTo('<a href="{{url}}">linky</a>', '<a href="linky.html">linky</a>', object);

      object.url = 'clippy.html';
      callback();

      equalHTML(fragment, '<a href="clippy.html">linky</a>');

      object.url = 'zippy.html';
      callback();

      equalHTML(fragment, '<a href="zippy.html">linky</a>');
    });
    */

    test("Attributes can be populated with helpers that generate a string", function() {
      registerHelper('testing', function(context, params, options) {
        return context[params[0]];
      });

      compilesTo('<a href="{{testing url}}">linky</a>', '<a href="linky.html">linky</a>', { url: 'linky.html'});
    });
    /*
    test("A helper can return a stream for the attribute", function() {
      registerHelper('testing', function(path, options) {
        return streamValue(this[path]);
      });

      compilesTo('<a href="{{testing url}}">linky</a>', '<a href="linky.html">linky</a>', { url: 'linky.html'});
    });
    */
    test("Attribute helpers take a hash", function() {
      registerHelper('testing', function(context, params, options) {
        return context[options.hash.path];
      });

      compilesTo('<a href="{{testing path=url}}">linky</a>', '<a href="linky.html">linky</a>', { url: 'linky.html' });
    });
    /*
    test("Attribute helpers can use the hash for data binding", function() {
      var callback;

      registerHelper('testing', function(path, options) {
        return boundValue(function(c) {
          callback = c;
          return this[path] ? options.hash.truthy : options.hash.falsy;
        }, this);
      });

      var object = { on: true };
      var fragment = compilesTo('<div class="{{testing on truthy="yeah" falsy="nope"}}">hi</div>', '<div class="yeah">hi</div>', object);

      object.on = false;
      callback();
      equalHTML(fragment, '<div class="nope">hi</div>');
    });
    */
    test("Attributes containing multiple helpers are treated like a block", function() {
      registerHelper('testing', function(context, params, options) {
        if (options.types[0] === 'id') {
          return context[params[0]];
        } else {
          return params[0];
        }
      });

      compilesTo('<a href="http://{{foo}}/{{testing bar}}/{{testing "baz"}}">linky</a>', '<a href="http://foo.com/bar/baz">linky</a>', { foo: 'foo.com', bar: 'bar' });
    });

    test("Attributes containing a helper are treated like a block", function() {
      expect(2);

      registerHelper('testing', function(context, params, options) {
        deepEqual(params, [123]);
        return "example.com";
      });

      compilesTo('<a href="http://{{testing 123}}/index.html">linky</a>', '<a href="http://example.com/index.html">linky</a>', { person: { url: 'example.com' } });
    });
    /*
    test("It is possible to trigger a re-render of an attribute from a child resolution", function() {
      var callback;

      registerHelper('RESOLVE_IN_ATTR', function(path, options) {
        return boundValue(function(c) {
          callback = c;
          return this[path];
        }, this);
      });

      var context = { url: "example.com" };
      var fragment = compilesTo('<a href="http://{{url}}/index.html">linky</a>', '<a href="http://example.com/index.html">linky</a>', context);

      context.url = "www.example.com";
      callback();

      equalHTML(fragment, '<a href="http://www.example.com/index.html">linky</a>');
    });

    test("A child resolution can pass contextual information to the parent", function() {
      var callback;

      registerHelper('RESOLVE_IN_ATTR', function(path, options) {
        return boundValue(function(c) {
          callback = c;
          return this[path];
        }, this);
      });

      var context = { url: "example.com" };
      var fragment = compilesTo('<a href="http://{{url}}/index.html">linky</a>', '<a href="http://example.com/index.html">linky</a>', context);

      context.url = "www.example.com";
      callback();

      equalHTML(fragment, '<a href="http://www.example.com/index.html">linky</a>');
    });

    test("Attribute runs can contain helpers", function() {
      var callbacks = [];

      registerHelper('RESOLVE_IN_ATTR', function(path, options) {
        return boundValue(function(c) {
          callbacks.push(c);
          return this[path];
        }, this);
      });

      registerHelper('testing', function(path, options) {
        return boundValue(function(c) {
          callbacks.push(c);

          if (options.types[0] === 'id') {
            return this[path] + '.html';
          } else {
            return path;
          }
        }, this);
      });

      var context = { url: "example.com", path: 'index' };
      var fragment = compilesTo('<a href="http://{{url}}/{{testing path}}/{{testing "linky"}}">linky</a>', '<a href="http://example.com/index.html/linky">linky</a>', context);

      context.url = "www.example.com";
      context.path = "yep";
      callbacks.forEach(function(callback) { callback(); });

      equalHTML(fragment, '<a href="http://www.example.com/yep.html/linky">linky</a>');

      context.url = "nope.example.com";
      context.path = "nope";
      callbacks.forEach(function(callback) { callback(); });

      equalHTML(fragment, '<a href="http://nope.example.com/nope.html/linky">linky</a>');
    });
    */
    test("A simple block helper can return the default document fragment", function() {

      hooks.CONTENT = function(placeholder, path, context, params, options) {
        placeholder.update(options.render(context));
      };

      compilesTo('{{#testing}}<div id="test">123</div>{{/testing}}', '<div id="test">123</div>');
    });

    test("A simple block helper can return text", function() {
      hooks.CONTENT = function(placeholder, path, context, params, options) {
        placeholder.update(options.render(context));
      };

      compilesTo('{{#testing}}test{{else}}not shown{{/testing}}', 'test');
    });

    test("A block helper can have an else block", function() {
      hooks.CONTENT = function(placeholder, path, context, params, options) {
        placeholder.update(options.inverse(context));
      };

      compilesTo('{{#testing}}Nope{{else}}<div id="test">123</div>{{/testing}}', '<div id="test">123</div>');
    });

    test("A block helper can pass a context to be used in the child", function() {
      var CONTENT = hooks.CONTENT;
      hooks.CONTENT = function(placeholder, path, context, params, options) {
        if (path === 'testing') {

          // TODO: this sucks
          options.helpers = hooks;

          placeholder.update(options.render({ title: 'Rails is omakase' }, options));
        } else {
          CONTENT.apply(this, arguments);
        }
      };

      compilesTo('{{#testing}}<div id="test">{{title}}</div>{{/testing}}', '<div id="test">Rails is omakase</div>');
    });

    test("A block helper can insert the document fragment manually", function() {
      var CONTENT = hooks.CONTENT;
      hooks.CONTENT = function(placeholder, path, context, params, options) {
        if (path === 'testing') {
          options.helpers = hooks;
          var frag = options.render({ title: 'Rails is omakase' }, options);
          placeholder.update(frag);
        } else {
          CONTENT.apply(this, arguments);
        }
      };

      compilesTo('{{#testing}}<div id="test">{{title}}</div>{{/testing}}', '<div id="test">Rails is omakase</div>');
    });

    test("Block helpers receive hash arguments", function() {
      hooks.CONTENT = function(placeholder, path, context, params, options) {
        if (options.hash.truth) {
          options.helpers = hooks;
          placeholder.update(options.render(context, options));
        }
      };

      compilesTo('{{#testing truth=true}}<p>Yep!</p>{{/testing}}{{#testing truth=false}}<p>Nope!</p>{{/testing}}', '<p>Yep!</p>');
    });
    /*

    test("Data-bound block helpers", function() {
      var callback;

      registerHelper('testing', function(path, options) {
        var context = this, firstElement, lastElement;

        var frag = buildFrag();

        function buildFrag() {
          var frag;

          var value = context[path];

          if (value) {
            frag = options.render(context);
          } else {
            frag = document.createDocumentFragment();
          }

          if (!frag.firstChild) {
            firstElement = lastElement = document.createTextNode('');
            frag.appendChild(firstElement);
          } else {
            firstElement = frag.firstChild;
            lastElement = frag.lastChild;
          }

          return frag;
        }

        callback = function() {
          var range = document.createRange();
          range.setStartBefore(firstElement);
          range.setEndAfter(lastElement);

          var frag = buildFrag();

          range.deleteContents();
          range.insertNode(frag);
        };

        return frag;
      });

      var object = { shouldRender: false };
      var template = '<p>hi</p> content {{#testing shouldRender}}<p>Appears!</p>{{/testing}} more <em>content</em> here';
      var fragment = compilesTo(template, '<p>hi</p> content  more <em>content</em> here', object);

      object.shouldRender = true;
      callback();

      equalHTML(fragment, '<p>hi</p> content <p>Appears!</p> more <em>content</em> here');

      object.shouldRender = false;
      callback();

      equalHTML(fragment, '<p>hi</p> content  more <em>content</em> here');
    });
    */

    test("Node helpers can modify the node", function() {
      registerHelper('testing', function(context, params, options) {
        options.element.setAttribute('zomg', 'zomg');
      });

      compilesTo('<div {{testing}}>Node helpers</div>', '<div zomg="zomg">Node helpers</div>');
    });

    test("Node helpers can be used for attribute bindings", function() {
      var callback;

      registerHelper('testing', function(context, params, options) {
        var path = options.hash.href,
            element = options.element;

        callback = function() {
          var value = context[path];
          element.setAttribute('href', value);
        };

        callback();
      });

      var object = { url: 'linky.html' };
      var fragment = compilesTo('<a {{testing href="url"}}>linky</a>', '<a href="linky.html">linky</a>', object);

      object.url = 'zippy.html';
      callback();

      equalHTML(fragment, '<a href="zippy.html">linky</a>');
    });
  });
define("htmlbars/tests/hydration_compiler_test",
  ["htmlbars/compiler/hydration_opcode","htmlbars/parser"],
  function(__dependency1__, __dependency2__) {
    "use strict";
    var HydrationOpcodeCompiler = __dependency1__.HydrationOpcodeCompiler;
    var preprocess = __dependency2__.preprocess;

    function opcodesFor(html, options) {
      var ast = preprocess(html, options),
          compiler1 = new HydrationOpcodeCompiler(options);
      compiler1.compile(ast);
      return compiler1.opcodes;
    }


    function mustache(name, placeholderNum) {
      return [ 'ambiguous', [name, true, placeholderNum] ];
    }

    function helper(name, params, placeholderNum) {
      return [ "helper", [name, params.length, true, placeholderNum] ];
    }

    module("HydrationOpcodeCompiler opcode generation");

    test("simple example", function() {
      var opcodes = opcodesFor("<div>{{foo}} bar {{baz}}</div>");
      deepEqual(opcodes, [
        [ "placeholder", [ 0, [ 0 ], -1, 0 ] ],
        [ "placeholder", [ 1, [ 0 ], 0, -1 ] ],
        mustache('foo', 0),
        mustache('baz', 1)
      ]);
    });

    test("element with a sole mustache child", function() {
      var opcodes = opcodesFor("<div>{{foo}}</div>");
      deepEqual(opcodes, [
        [ "placeholder", [ 0, [ 0 ], -1, -1 ] ],
        mustache('foo', 0)
      ]);
    });

    test("element with a mustache between two text nodes", function() {
      var opcodes = opcodesFor("<div> {{foo}} </div>");
      deepEqual(opcodes, [
        [ "placeholder", [ 0, [ 0 ], 0, 1 ] ],
        mustache('foo', 0)
      ]);
    });

    test("mustache two elements deep", function() {
      var opcodes = opcodesFor("<div><div>{{foo}}</div></div>");
      deepEqual(opcodes, [
        [ "consumeParent", [ 0 ] ],
        [ "placeholder", [ 0, [ 0, 0 ], -1, -1 ] ],
        mustache('foo', 0),
        [ "popParent", [] ]
      ]);
    });

    test("two sibling elements with mustaches", function() {
      var opcodes = opcodesFor("<div>{{foo}}</div><div>{{bar}}</div>");
      deepEqual(opcodes, [
        [ "consumeParent", [ 0 ] ],
        [ "placeholder", [ 0, [ 0 ], -1, -1 ] ],
        mustache('foo', 0),
        [ "popParent", [] ],
        [ "consumeParent", [ 1 ] ],
        [ "placeholder", [ 1, [ 1 ], -1, -1 ] ],
        mustache('bar', 1),
        [ "popParent", [] ]
      ]);
    });

    test("mustaches at the root", function() {
      var opcodes = opcodesFor("{{foo}} {{bar}}");
      deepEqual(opcodes, [
        [ "placeholder", [ 0, [ ], 0, 1 ] ],
        [ "placeholder", [ 1, [ ], 1, 2 ] ],
        mustache('foo', 0),
        mustache('bar', 1)
      ]);
    });

    test("back to back mustaches should have a text node inserted between them", function() {
      var opcodes = opcodesFor("<div>{{foo}}{{bar}}{{baz}}wat{{qux}}</div>");
      deepEqual(opcodes, [
        [ "placeholder", [ 0, [0], -1, 0 ] ],
        [ "placeholder", [ 1, [0], 0, 1 ] ],
        [ "placeholder", [ 2, [0], 1, 2 ] ],
        [ "placeholder", [ 3, [0], 2, -1 ] ],
        mustache('foo', 0),
        mustache('bar', 1),
        mustache('baz', 2),
        mustache('qux', 3)
      ]);
    });

    test("helper usage", function() {
      var opcodes = opcodesFor("<div>{{foo 'bar'}}</div>");
      deepEqual(opcodes, [
        [ "placeholder", [ 0, [0], -1, -1 ] ],
        [ "program", [null, null] ],
        [ "stringLiteral", ['bar'] ],
        [ "stackLiteral", [0] ],
        helper('foo', ['bar'], 0)
      ]);
    });

    test("node mustache", function() {
      var opcodes = opcodesFor("<div {{foo}}></div>");
      deepEqual(opcodes, [
        [ "program", [null, null] ],
        [ "stackLiteral", [0] ],
        [ "nodeHelper", ["foo", 0, [0]] ]
      ]);
    });

    test("node helper", function() {
      var opcodes = opcodesFor("<div {{foo 'bar'}}></div>");
      deepEqual(opcodes, [
        [ "program", [null, null] ],
        [ "stringLiteral", ['bar'] ],
        [ "stackLiteral", [0] ],
        [ "nodeHelper", ["foo", 1, [0]] ]
      ]);
    });

    test("attribute mustache", function() {
      var opcodes = opcodesFor("<div class='before {{foo}} after'></div>");
      deepEqual(opcodes, [
        [ "program", [null, null] ],
        [ "stringLiteral", ["class"] ],
        [ "string", ["sexpr"] ],
        [ "program", [null, null] ],
        [ "stringLiteral", ["before "] ],
        [ "string", ["sexpr"] ],
        [ "program", [null, null] ],
        [ "stackLiteral", [0] ],
        [ "sexpr", [ "foo", 0 ] ],
        [ "stringLiteral", [" after"] ],
        [ "stackLiteral", [0] ],
        [ "sexpr", [ "CONCAT", 3 ] ],
        [ "stackLiteral", [0] ],
        [ "nodeHelper", [ "ATTRIBUTE", 2, [ 0 ] ] ]
      ]);
    });


    test("attribute helper", function() {
      var opcodes = opcodesFor("<div class='before {{foo 'bar'}} after'></div>");
      deepEqual(opcodes, [
        [ "program", [ null, null ] ],
        [ "stringLiteral", [ "class" ] ],
        [ "string", [ "sexpr" ] ],
        [ "program", [ null, null ] ],
        [ "stringLiteral", [ "before " ] ],
        [ "string", [ "sexpr" ] ],
        [ "program", [ null, null ] ],
        [ "stringLiteral", [ "bar" ] ],
        [ "stackLiteral", [ 0 ] ],
        [ "sexpr", [ "foo", 1 ] ],
        [ "stringLiteral", [ " after" ] ],
        [ "stackLiteral", [ 0 ] ],
        [ "sexpr", [ "CONCAT", 3 ] ],
        [ "stackLiteral", [ 0 ] ],
        [ "nodeHelper", [ "ATTRIBUTE", 2, [ 0 ] ] ]
      ]);
    });
  });
define("htmlbars/tests/placeholder_test",
  ["htmlbars/runtime/placeholder","handlebars/safe-string"],
  function(__dependency1__, __dependency2__) {
    "use strict";
    var Placeholder = __dependency1__.Placeholder;
    var SafeString = __dependency2__["default"];

    function placeholderTests(factory) {
      test('updateNode '+factory.name, function () {
        var fixture = document.getElementById('qunit-fixture'),
          setup = factory.create(),
          fragment = setup.fragment,
          placeholder = setup.placeholder,
          startHTML = setup.startHTML,
          contentHTML = setup.contentHTML,
          endHTML = setup.endHTML,
          html;

        placeholder.updateNode(element('p', 'updated'));

        html = startHTML+'<p>updated</p>'+endHTML;

        equalHTML(fragment, html);

        fixture.appendChild(setup.fragment);

        placeholder.updateNode(element('p', 'updated again'));

        html = startHTML+'<p>updated again</p>'+endHTML;

        equal(fixture.innerHTML, html);
      });

      test('updateText '+factory.name, function () {
        var fixture = document.getElementById('qunit-fixture'),
          setup = factory.create(),
          fragment = setup.fragment,
          placeholder = setup.placeholder,
          startHTML = setup.startHTML,
          contentHTML = setup.contentHTML,
          endHTML = setup.endHTML,
          html;

        placeholder.updateText('updated');

        html = startHTML+'updated'+endHTML;

        equalHTML(fragment, html);

        fixture.appendChild(fragment);

        placeholder.updateText('updated again');

        html = startHTML+'updated again'+endHTML;

        equal(fixture.innerHTML, html);
      });

      test('updateHTML '+factory.name, function () {
        var fixture = document.getElementById('qunit-fixture'),
          setup = factory.create(),
          fragment = setup.fragment,
          placeholder = setup.placeholder,
          startHTML = setup.startHTML,
          contentHTML = setup.contentHTML,
          endHTML = setup.endHTML,
          html;

        placeholder.updateHTML('<p>A</p><p>B</p><p>C</p>');

        html = startHTML+'<p>A</p><p>B</p><p>C</p>'+endHTML;

        equalHTML(fragment, html);

        fixture.appendChild(fragment);

        placeholder.updateHTML('<p>updated</p>');

        html = startHTML+'<p>updated</p>'+endHTML;

        equal(fixture.innerHTML, html);
      });

      test('destroy '+factory.name, function () {
        var setup = factory.create(),
          fragment = setup.fragment,
          placeholder = setup.placeholder,
          startHTML = setup.startHTML,
          endHTML = setup.endHTML,
          html;

        placeholder.destroy();

        html = startHTML+endHTML;

        equalHTML(fragment, html);
      });

      test('destroy after insert '+factory.name, function () {
        var fixture = document.getElementById('qunit-fixture'),
          setup = factory.create(),
          fragment = setup.fragment,
          placeholder = setup.placeholder,
          startHTML = setup.startHTML,
          endHTML = setup.endHTML,
          html;

        fixture.appendChild(fragment);

        placeholder.destroy();

        html = startHTML+endHTML;

        equal(fixture.innerHTML, html);
      });

      test('update '+factory.name, function () {
        var setup = factory.create(),
          fragment = setup.fragment,
          placeholder = setup.placeholder,
          startHTML = setup.startHTML,
          endHTML = setup.endHTML,
          html;

        placeholder.update(element('p', 'updated'));
        html = startHTML+'<p>updated</p>'+endHTML;
        equalHTML(fragment, html);

        placeholder.update('updated');
        html = startHTML+'updated'+endHTML;
        equalHTML(fragment, html);

        placeholder.update(new SafeString('<p>updated</p>'));
        html = startHTML+'<p>updated</p>'+endHTML;
        equalHTML(fragment, html);

        var duckTypedSafeString = {
          string: '<div>updated</div>'
        };
        placeholder.update(duckTypedSafeString);
        html = startHTML+'<div>updated</div>'+endHTML;
        equalHTML(fragment, html);
      });
    }

    function placeholderListTests(factory) {
      test('various list operations with fragments '+factory.name, function () {
        var fixture = document.getElementById('qunit-fixture'),
          setup = factory.create(),
          fragment = setup.fragment,
          placeholder = setup.placeholder,
          startHTML = setup.startHTML,
          endHTML = setup.endHTML,
          html;

        var A = element('p', 'A');
        var B = element('p', 'B');
        var C = element('p', 'C');
        var D = element('p', 'D');
        var E = element('p', 'E');
        var F = element('p', 'F');

        var fragmentABC = fragmentFor(A,B,C);
        var fragmentEF = fragmentFor(E,F);

        placeholder.replace(0, 0, [fragmentABC, D, fragmentEF]);

        var placeholders = placeholder.placeholders;

        html = startHTML+'<p>A</p><p>B</p><p>C</p><p>D</p><p>E</p><p>F</p>'+endHTML;
        equalHTML(fragment, html);
        equal(placeholders[0].start, placeholder.start);
        equal(placeholders[0].end, D);
        equal(placeholders[1].start, C);
        equal(placeholders[1].end, E);
        equal(placeholders[2].start, D);
        equal(placeholders[2].end, placeholder.end);

        placeholder.replace(1,2);

        html = startHTML+'<p>A</p><p>B</p><p>C</p>'+endHTML;
        equalHTML(fragment, html);
        equal(placeholders.length, 1);
        equal(placeholders[0].start, placeholder.start);
        equal(placeholders[0].end, placeholder.end);

        placeholder.replace(1,0,['D', '', null, 'E', new SafeString('<p>F</p>')]);
        html = startHTML+'<p>A</p><p>B</p><p>C</p>DE<p>F</p>'+endHTML;
        equalHTML(fragment, html);

        equal(placeholder.placeholders.length, 6);
        equal(placeholders[0].start, placeholder.start);
        equal(placeholders[0].end,   placeholders[1].start.nextSibling);
        equal(placeholders[1].start, placeholders[0].end.previousSibling);
        equal(placeholders[1].end,   placeholders[2].start.nextSibling);
        equal(placeholders[2].start, placeholders[1].end.previousSibling);
        equal(placeholders[2].end,   placeholders[3].start.nextSibling);
        equal(placeholders[3].start, placeholders[2].end.previousSibling);
        equal(placeholders[3].end,   placeholders[4].start.nextSibling);
        equal(placeholders[4].start, placeholders[3].end.previousSibling);
        equal(placeholders[4].end,   placeholders[5].start.nextSibling);
        equal(placeholders[5].start, placeholders[4].end.previousSibling);
        equal(placeholders[5].end,   placeholder.end);

        placeholders[3].destroy();
        placeholders[3].update(element('i', 'E'));
        placeholders[1].update(element('b', 'D'));
        placeholders[2].destroy();

        html = startHTML+'<p>A</p><p>B</p><p>C</p><b>D</b><i>E</i><p>F</p>'+endHTML;
        equalHTML(fragment, html);
        equal(placeholder.placeholders.length, 4);
        equal(placeholders[0].start, placeholder.start);
        equal(placeholders[0].end,   placeholders[1].start.nextSibling);
        equal(placeholders[1].start, placeholders[0].end.previousSibling);
        equal(placeholders[1].end,   placeholders[2].start.nextSibling);
        equal(placeholders[2].start, placeholders[1].end.previousSibling);
        equal(placeholders[2].end,   placeholders[3].start.nextSibling);
        equal(placeholders[3].start, placeholders[2].end.previousSibling);
        equal(placeholders[3].end,   placeholder.end);

        fixture.appendChild(fragment);

        placeholder.replace(2,2);

        placeholders[1].update(
          fragmentFor(
            element('p','D'),
            element('p','E'),
            element('p','F')
          )
        );

        html = startHTML+'<p>A</p><p>B</p><p>C</p><p>D</p><p>E</p><p>F</p>'+endHTML;
        equal(fixture.innerHTML, html);

        equal(placeholder.placeholders.length, 2);
        equal(placeholders[0].start,  placeholder.start);
        equal(placeholders[0].end,    placeholders[1].start.nextSibling);
        equal(placeholders[0].before, null);
        equal(placeholders[0].after,  placeholders[1]);
        equal(placeholders[1].start,  placeholders[0].end.previousSibling);
        equal(placeholders[1].end,    placeholder.end);
        equal(placeholders[1].before, placeholders[0]);
        equal(placeholders[1].after,  null);
      });
    }

    function equalHTML(fragment, html) {
      var div = document.createElement("div");
      div.appendChild(fragment.cloneNode(true));

      QUnit.push(div.innerHTML === html, div.innerHTML, html);
    }

    function fragmentFor() {
      var fragment = document.createDocumentFragment();
      for (var i=0,l=arguments.length; i<l; i++) {
        fragment.appendChild(arguments[i]);
      }
      return fragment;
    }

    function element(tag, text) {
      var el = document.createElement(tag);
      el.appendChild(document.createTextNode(text));
      return el;
    }

    function textNode(text) {
      return document.createTextNode(text);
    }

    var parents = [
      {
        name: 'with parent as an element',
        create: function (frag) {
          var parent = document.createElement('div');
          frag.appendChild(parent);
          return parent;
        },
        startHTML: '<div>',
        endHTML: '</div>'
      },
      {
        name: 'with parent as a fragment',
        create: function (frag) {
          return frag;
        },
        startHTML: '',
        endHTML: ''
      }
    ];

    var starts = [
      {
        name: 'with sibling before',
        create: function (parent) {
          var start = document.createTextNode('Some text before ');
          parent.appendChild(start);
          return parent.childNodes.length-1;
        },
        HTML: 'Some text before '
      },
      {
        name: 'with no sibling before',
        create: function (parent) {
          return -1;
        },
        HTML: ''
      }
    ];

    var ends = [
      {
        name: 'and sibling after',
        create: function (parent) {
          var end = document.createTextNode(' some text after.');
          parent.appendChild(end);
          return parent.childNodes.length-1;
        },
        HTML: ' some text after.'
      },
      {
        name: 'and no sibling after',
        create: function (parent) {
          return -1;
        },
        HTML: ''
      }
    ];

    var contents = [
      {
        name: 'with an empty Placeholder',
        create: function (parent) { },
        HTML: ''
      },
      {
        name: 'with some paragraphs in the Placeholder',
        create: function (parent) {
          var p;
          p = document.createElement('p');
          p.textContent = 'a';
          parent.appendChild(p);
          p = document.createElement('p');
          p.textContent = 'b';
          parent.appendChild(p);
          p = document.createElement('p');
          p.textContent = 'c';
          parent.appendChild(p);
        },
        HTML: '<p>a</p><p>b</p><p>c</p>'
      }
    ];

    function iterateCombinations(parents, starts, ends, contents, callback) {
      function buildFactory(parentFactory, startFactory, endFactory, contentFactory) {
        return {
          name: [parentFactory.name, startFactory.name, endFactory.name, contentFactory.name].join(' '),
          create: function factory() {
            var fragment = document.createDocumentFragment(),
            parent = parentFactory.create(fragment),
            startIndex = startFactory.create(parent),
            content = contentFactory.create(parent),
            endIndex = endFactory.create(parent);

            // this is prevented in the parser by generating
            // empty text nodes at boundaries of fragments

            if (parent === fragment && (startIndex === -1 || endIndex === -1)) {
              return null;
            }

            return {
              fragment: fragment,
              placeholder: Placeholder.create(parent, startIndex, endIndex),
              startHTML: parentFactory.startHTML + startFactory.HTML,
              contentHTML: contentFactory.HTML,
              endHTML: endFactory.HTML + parentFactory.endHTML
            };
          }
        };
      }

      for (var i=0; i<parents.length; i++) {
        for (var j=0; j<starts.length; j++) {
          for (var k=0; k<ends.length; k++) {
            for (var l=0; l<contents.length; l++) {
              var factory = buildFactory(parents[i], starts[j], ends[k], contents[l]);
              if (factory.create() === null) continue; // unsupported combo
              callback(factory);
            }
          }
        }
      }
    }

    QUnit.module('Placeholder');
    iterateCombinations(parents, starts, ends, contents, placeholderTests);

    QUnit.module('PlaceholderList');
    iterateCombinations(parents, starts, ends, [{name:'', create: function(){},HTML:''}], placeholderListTests);
  });
define("htmlbars/tests/template_compiler_test",
  ["htmlbars/compiler/template","htmlbars/runtime/placeholder","htmlbars/parser"],
  function(__dependency1__, __dependency2__, __dependency3__) {
    "use strict";
    var TemplateCompiler = __dependency1__.TemplateCompiler;
    var Placeholder = __dependency2__.Placeholder;
    var preprocess = __dependency3__.preprocess;

    module("TemplateCompiler");

    function equalHTML(fragment, html) {
      var div = document.createElement("div");
      div.appendChild(fragment.cloneNode(true));

      QUnit.push(div.innerHTML === html, div.innerHTML, html);
    }

    var dom = {
      createDocumentFragment: function () {
        return document.createDocumentFragment();
      },
      createElement: function (name) {
        return document.createElement(name);
      },
      appendText: function (node, string) {
        node.appendChild(document.createTextNode(string));
      },
      createTextNode: function(string) {
        return document.createTextNode(string);
      }
    };

    var helpers = {
      CONTENT: function(placeholder, helperName, context, params, options, helpers) {
        if (helperName === 'if') {
          if (context[params[0]]) {
            options.helpers = helpers;
            placeholder.update(options.render(context, options));
          }
          return;
        }
        placeholder.update(context[helperName]);
      }
    };

    test("it works", function testFunction() {
      /* jshint evil: true */
      var ast = preprocess('<div>{{#if working}}Hello {{firstName}} {{lastName}}!{{/if}}</div>');
      var compiler = new TemplateCompiler();
      var program = compiler.compile(ast);
      var template = new Function("dom", "Placeholder", "return " + program)(dom, Placeholder);
      var frag = template(
        { working: true, firstName: 'Kris', lastName: 'Selden' },
        { helpers: helpers }
      );
      equalHTML(frag, '<div>Hello Kris Selden!</div>');
    });
  });
define("htmlbars/utils",
  ["exports"],
  function(__exports__) {
    "use strict";
    function merge(options, defaults) {
      for (var prop in defaults) {
        if (options.hasOwnProperty(prop)) { continue; }
        options[prop] = defaults[prop];
      }
      return options;
    }

    __exports__.merge = merge;
  });