var BLOCK_TERMINATOR      = 0x00,

    LABEL_APPLICATION     = 0xff,
    LABEL_COMMENT         = 0xfe,
    LABEL_GRAPHIC_CONTROL = 0xf9,
    LABEL_PLAIN_TEXT      = 0x01;

/**
 * https://github.com/shachaf/jsgif/blob/master/gif.js
 */
function GIFDecoder(data) {
    this.data   = data;
    this.length = data.length;
    this.index  = 0;
}

GIFDecoder.prototype = {
    constructor: GIFDecoder,

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
    },

    parse: function() {
        this.parseHeader();
    },

    parseHeader: function() {
        var head = this.readString(6),
            signature = head.substring(0, 3),
            version   = head.substring(3);

        console.log("Signature = ", signature);
        console.log('Version   = ', version);

        this.parseLogicalScreenDescriptor();
    },

    parseLogicalScreenDescriptor: function() {
        console.log('width  = ', this.readUnsigned(), 'px');
        console.log('height = ', this.readUnsigned(), 'px');

        /**
         * <Packed Fields>  =      Global Color Table Flag       1 Bit
         *                         Color Resolution              3 Bits
         *                         Sort Flag                     1 Bit
         *                         Size of Global Color Table    3 Bits
         */
        var packedFields = this.readBinary(),
            hasGlobalColorTable    = false,
            sizeOfGlobalColorTable = 0;

        console.log('Global Color Table Flag = ', hasGlobalColorTable = packedFields.shift());
        console.log('Color Resolution        = ', packedFields.splice(0, 3));
        console.log('Sort Flag               = ', packedFields.shift());
        console.log('Size of Global Color Table = ', sizeOfGlobalColorTable = packedFields);

        console.log('Background Color Index = ', this.readByte());
        console.log('Pixel Aspect Ratio     = ', this.readByte());

        if(hasGlobalColorTable) {
            this.parseGlobalColorTable(parseInt(sizeOfGlobalColorTable.join(''), 2));
        }

        this.parseBlock();
    },

    parseGlobalColorTable: function(size) {
        var raw,
            len,
            colors = [],
            i = 0;

        size = 3 * (1 << (size + 1));
        console.log('Global Color Table\'s size = ', size);
        console.log(raw = this.readString(size));

        for(len = raw.length; i < len - 2; i += 3) {
            colors.push(toHex(raw[i]) + toHex(raw[i + 1]) + toHex(raw[i + 2]));
        }

        console.log(colors);
    },

    parseBlock: function() {
        var separator = this.readChar(1);

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
        var label = this.readByte();
        console.log('label = ', label);

        if(label == LABEL_APPLICATION) {
            console.log('Extension Type = Application');
            this.parseApplicationExtension();
        } else if(label == LABEL_COMMENT) {
            console.log('Extension Type = Comment');
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
        var size = this.readByte(), bytes;

        if(size != 0x0b) {
            throw Error('Not a correct Application Extension.');
        }
        console.log(size);
        console.log('Application Identifier = ', this.readString(size));
        size  = this.readByte();
        bytes = this.readString(size);
        console.log(bytes);
        if(this.readByte() != BLOCK_TERMINATOR) {
            throw Error('Block is not terminated correctly!')
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
        this.readByte();
        var fields = this.readBinary();
        console.log('FIELDS ', fields)
        console.log('Reserved = ', fields.splice(0, 3));
        console.log('Disposal Method = ', fields.splice(0, 3));
        console.log('User Input Flag = ', fields.shift());
        console.log('Transparent Color Flag = ', fields[0]);

        console.log('Delay Time = ', this.readUnsigned());
        console.log('Transparent Color Index = ', this.readByte());

        if(this.readByte() != BLOCK_TERMINATOR) {
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
        console.log('Image Left Position = ', this.readUnsigned());
        console.log('Image Top  Position = ', this.readUnsigned());
        console.log('Image Width         = ', this.readUnsigned());
        console.log('Image Height        = ', this.readUnsigned());

        var fields = this.readBinary(),
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

        var LZWMinimumCodeSize = this.readByte();
        console.log('LZW Minimum Code Size = ', LZWMinimumCodeSize);

        var next, imgData;
        while((next = this.readByte()) != BLOCK_TERMINATOR) {
            imgData = this.readBytes(next);
            //console.log(imgData);
        }

        this.parseBlock();
    },

    parseDone: function() {
        //TODO
        console.log('Parse Done!')
    }
};

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