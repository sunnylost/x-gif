(function(root, mod) {
    if (typeof exports == "object" && typeof module == "object") return mod(exports); // CommonJS
    if (typeof define == "function" && define.amd) return define(["exports"], mod); // AMD
    root.Gift = mod(); // Plain browser env
})(this, function(exports) {
    "use strict";

    var BLOCK_TERMINATOR      = 0x00,

        LABEL_APPLICATION     = 0xff,
        LABEL_COMMENT         = 0xfe,
        LABEL_GRAPHIC_CONTROL = 0xf9,
        LABEL_PLAIN_TEXT      = 0x01;

    function DataStream(data) {
        this.data   = data;
        this.length = data.length;
        this.index  = 0;
    }

    DataStream.prototype = {
        constructor: DataStream,

        readByte: function() {
            return this.data[this.index++];
        },

        readBytes: function(len) {
            var bytes = [];
            while(len--) {
                bytes.push(this.readByte());
            }
            return bytes;
        },

        readUnsigned: function() {
            var a = this.readBytes(2);
            return (a[1] << 8) + a[0];
        },

        readBinary: function() {
            var a   = [];
            var str = new String(this.readByte().toString(2));

            str.length < 8 && (str = new Array(9 - str.length).join('0') + str);

            a.forEach.call(str, function(v) {
                a.push(+v);
            });

            return a;
        },

        readChar: function() {
            return String.fromCharCode(this.readByte());
        },

        readString: function(len) {
            return String.fromCharCode.apply(null, this.readBytes(len));
        }
    };

    /**
     * https://github.com/shachaf/jsgif/blob/master/gif.js
     */
    function GIFDecoder(data) {
        this.stream = new DataStream(data);
        this.frames = [];
    }

    GIFDecoder.prototype = {
        constructor: GIFDecoder,

        parse: function() {
            this.parseHeader();
            this.parseBlock();
        },

        parseHeader: function() {
            var stream    = this.stream,
                head      = stream.readString(6),
                signature = head.substring(0, 3),
                version   = head.substring(3);

            console.log("Signature = ", signature);
            console.log('Version   = ', version);

            this.parseLogicalScreenDescriptor();

            this.gifHeader = stream.data.subarray(0, stream.index);
        },

        parseLogicalScreenDescriptor: function() {
            var stream = this.stream;
            console.log('width  = ', this.width  = stream.readUnsigned(), 'px');
            console.log('height = ', this.height = stream.readUnsigned(), 'px');

            /**
             * <Packed Fields>  =      Global Color Table Flag       1 Bit
             *                         Color Resolution              3 Bits
             *                         Sort Flag                     1 Bit
             *                         Size of Global Color Table    3 Bits
             */
            var packedFields = stream.readBinary(),
                hasGlobalColorTable    = false,
                sizeOfGlobalColorTable = 0;

            console.log('Global Color Table Flag = ', hasGlobalColorTable = packedFields.shift());
            console.log('Color Resolution        = ', packedFields.splice(0, 3));
            console.log('Sort Flag               = ', packedFields.shift());
            console.log('Size of Global Color Table = ', sizeOfGlobalColorTable = packedFields);

            console.log('Background Color Index = ', stream.readByte());
            console.log('Pixel Aspect Ratio     = ', stream.readByte());

            if(hasGlobalColorTable) {
                this.parseGlobalColorTable(parseInt(sizeOfGlobalColorTable.join(''), 2));
            }
        },

        parseGlobalColorTable: function(size) {
            var stream = this.stream,
                raw,
                len,
                colors = [],
                i = 0;

            size = 3 * (1 << (size + 1));
            console.log('Global Color Table\'s size = ', size);
            console.log(raw = stream.readString(size));

            for(len = raw.length; i < len - 2; i += 3) {
                colors.push(raw[i], raw[i + 1], raw[i + 2]);
                //colors.push(toHex(raw[i]) + toHex(raw[i + 1]) + toHex(raw[i + 2]));
            }

            this.globalColorTable = colors;
        },

        parseBlock: function() {
            var stream    = this.stream,
                separator = stream.readChar(1);

            switch(separator) {
                //, -> 0x2c Image Separator
                case ',':
                    console.log('Image Separator');
                    this.parseImageBlock();
                    break;

                //! -> 0x21 Extension Introducer
                case '!':
                    this.parseExtension();
                    break;

                //; -> 0x3b Trailer
                case ';':
                    this.parseDone();
                    break;

                default:
                    throw Error('Cannot recognize char ', separator);
            }
        },

        //TODO
        parseExtension: function() {
            var stream = this.stream,
                label  = stream.readByte();

            console.log('label = ', label);

            if(label == LABEL_APPLICATION) {
                console.log('Extension Type = Application');
                this.parseApplicationExtension();
            } else if(label == LABEL_COMMENT) {
                console.log('Extension Type = Comment');
                this.parseCommentExtension();
            } else if(label == LABEL_GRAPHIC_CONTROL) {
                console.log('Extension Type = Graphic control');
                this.parseGraphicControlExtension();
            } else if(label == LABEL_PLAIN_TEXT) {
                console.log('Extension Type = Plain text');
            }

            this.parseBlock();
        },

        /**
         * Offset   Length   Contents
         0      1 byte   Extension Introducer (0x21)
         1      1 byte   Application Label (0xff)
         2      1 byte   Block Size (0x0b)
         3      8 bytes  Application Identifire
         [
         1 byte   Block Size (s)
         (s)bytes  Application Data
         ]*
         1 byte   Block Terminator(0x00)
         */
        parseApplicationExtension: function() {
            var stream = this.stream,
                size   = stream.readByte(), bytes;

            if(size != 0x0b) {
                throw Error('Not a correct Application Extension.');
            }
            console.log(size);
            console.log('Application Identifier = ', stream.readString(size));
            size  = stream.readByte();
            bytes = stream.readString(size);
            console.log(bytes);
            if(stream.readByte() != BLOCK_TERMINATOR) {
                throw Error('Block is not terminated correctly!');
            }
        },

        parseCommentExtension: function() {
            var stream = this.stream,
                size   = stream.readByte(), datas;

            datas = stream.readString(size);
            console.log('Comment content ', datas)

            if(stream.readByte() != BLOCK_TERMINATOR) {
                throw Error('Comment Extension Block is not terminated correctly!');
            }
        },

        /**
         * Graphic Control Extension Block

         Offset   Length   Contents
         0      1 byte   Extension Introducer (0x21)
         1      1 byte   Graphic Control Label (0xf9)
         2      1 byte   Block Size (0x04)
         3      1 byte   bit 0..2: Reserved
         bit 3..5: Disposal Method
         bit 6:    User Input Flag
         bit 7:    Transparent Color Flag
         4      2 bytes  Delay Time (1/100ths of a second)
         6      1 byte   Transparent Color Index
         7      1 byte   Block Terminator(0x00)
         */
        parseGraphicControlExtension: function() {
            var stream = this.stream;

            stream.readByte();
            var fields = stream.readBinary();
            console.log('FIELDS ', fields);
            console.log('Reserved = ', fields.splice(0, 3));
            console.log('Disposal Method = ', fields.splice(0, 3));
            console.log('User Input Flag = ', fields.shift());
            console.log('Transparent Color Flag = ', fields[0]);

            console.log('Delay Time = ', this.delay = stream.readUnsigned());
            console.log('Transparent Color Index = ', stream.readByte());

            if(stream.readByte() != BLOCK_TERMINATOR) {
                throw Error('Block is not terminated correctly!')
            }
        },

        /**
         * Offset   Length   Contents
         0      1 byte   Image Separator (0x2c)
         1      2 bytes  Image Left Position
         3      2 bytes  Image Top Position
         5      2 bytes  Image Width
         7      2 bytes  Image Height
         8      1 byte   bit 0:    Local Color Table Flag (LCTF)
         bit 1:    Interlace Flag
         bit 2:    Sort Flag
         bit 2..3: Reserved
         bit 4..7: Size of Local Color Table: 2^(1+n)
         ? bytes  Local Color Table(0..255 x 3 bytes) if LCTF is one
         1 byte   LZW Minimum Code Size
         [ // Blocks
         1 byte   Block Size (s)
         (s)bytes  Image Data
         ]*
         1 byte   Block Terminator(0x00)

         */
        parseImageBlock: function() {
            var stream = this.stream,
                index  = stream.index,
                lzwConfig = {};

            console.log('Image Left Position = ', lzwConfig.leftPos = stream.readUnsigned());
            console.log('Image Top  Position = ', lzwConfig.topPos  = stream.readUnsigned());
            console.log('Image Width         = ', lzwConfig.width   = stream.readUnsigned());
            console.log('Image Height        = ', lzwConfig.height  = stream.readUnsigned());

            var fields = stream.readBinary(),
                hasLocalColorTable,
                localColorTableSize;

            console.log('Local Color Table Flag = ', hasLocalColorTable = fields.shift());
            console.log('Interlace Flag = ', fields.shift());
            console.log('Sort Flag = ', fields.shift());
            console.log('Reserved = ', fields.splice(0, 1));
            console.log('Size of Local Color Table = ', localColorTableSize = fields);

            if(hasLocalColorTable) {
                //TODO
            }

            lzwConfig.codeSize = stream.readByte();
            console.log('LZW Minimum Code Size = ', lzwConfig.codeSize);

            var next, imgData = [];
            while((next = stream.readByte()) != BLOCK_TERMINATOR) {
                imgData.push(next);
                imgData = imgData.concat(stream.readBytes(next));
            }

            this.frames.push({
                data: stream.data.subarray(index - 1, stream.index)
            });

            this.parseBlock();
        },

        parseDone: function() {
            this.gifFooter = this.stream.data.subarray(-1);
            console.log(this.gifFooter);
            //TODO
            console.log('Parse Done!')
        }
    };

    /**
     * https://github.com/shachaf/jsgif/blob/master/gif.js#L52
     */
    function parseLZW(config) {
        var globalColorTable = config.globalColorTable,
            minCodeSize      = config.codeSize,
            data = config.data;

        var pos = 0; // Maybe this streaming thing should be merged with the Stream?

        var readCode = function(size) {
            var code = 0;
            for (var i = 0; i < size; i++) {
                if (data[pos >> 3] & (1 << (pos & 7))) {
                    code |= 1 << i;
                }
                pos++;
            }
            return code;
        };

        var output = [];

        var clearCode = 1 << minCodeSize;
        var eoiCode = clearCode + 1;

        var codeSize = minCodeSize + 1;

        var dict = [];

        var clear = function() {
            dict = [];
            codeSize = minCodeSize + 1;
            for (var i = 0; i < clearCode; i++) {
                dict[i] = [i];
            }
            dict[clearCode] = [];
            dict[eoiCode] = null;

        };

        var code;
        var last;

        while (true) {
            last = code;
            code = readCode(codeSize);

            if (code === clearCode) {
                clear();
                continue;
            }
            if (code === eoiCode) break;

            if (code < dict.length) {
                if (last !== clearCode) {
                    dict.push(dict[last].concat(dict[code][0]));
                }
            } else {
                if (code !== dict.length) throw new Error('Invalid LZW code.');
                dict.push(dict[last].concat(dict[last][0]));
            }
            output.push.apply(output, globalColorTable[dict[code]].map(function(v) {
                return globalColorTable[v];
            }));

            if (dict.length === (1 << codeSize) && codeSize < 12) {
                codeSize++;
            }
        }

        return output;
    }

    function toHex(str) {
        str = (str.charCodeAt(0) & 0xff).toString(16);
        return str[1] ? str : ('0' + str[0]);
    }

    /**
     * Control Label 0xf9
     * Comment Label 0xfe
     * Plain Text label 0x01
     * Application Extension Label 0xff
     */

    return function(data) {
        return new GIFDecoder(data);
    };
})