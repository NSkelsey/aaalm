/******************************************************************************
* This is a very simple binary tree based bin packing algorithm that is initialized
* with a fixed width and height and will fit each block into the first node where
* it fits and then split that node into 2 parts (down and right) to track the
* remaining whitespace.
* Best results occur when the input blocks are sorted by height, or even better
* when sorted by max(width,height).
* Inputs:
* ------
* w:       width of target rectangle
* h:      height of target rectangle
* blocks: array of any objects that have .w and .h attributes
* Outputs:
* -------
* marks each block that fits with a .fit attribute pointing to a
* node with .x and .y coordinates
* Example:
* -------
* var blocks = [
*     { w: 100, h: 100 },
*     { w: 100, h: 100 },
*     { w:  80, h:  80 },
*     { w:  80, h:  80 },
*     etc
*     etc
* ];
* var packer = new Packer(500, 500);
* packer.fit(blocks);
* for(var n = 0 ; n < blocks.length ; n++) {
*     var block = blocks[n];
*     if (block.fit) {
*         Draw(block.fit.x, block.fit.y, block.w, block.h);
*     }
* }
******************************************************************************/
Packer = function(w, h) {
  this.init(w, h);
};

Packer.prototype = {

  init: function(w, h) {
    this.root = { x: 0, y: 0, w: w, h: h };
  },

  fit: function(blocks) {
    var n, node, block;
    for (n = 0; n < blocks.length; n++) {
      block = blocks[n];
      block.rotate = false;
      if (node = this.findNode(this.root, block)) {
        block.fit = this.splitNode(node, block);
      }
    }
    let success = true;
    blocks.forEach(block => {
      if (!block.hasOwnProperty("fit") || !block.fit.hasOwnProperty("x")) {
          success = false;
      }
    });

    return success;
  },

  findNode: function(root, block) {
    if (root.used) {
      return this.findNode(root.right, block) || this.findNode(root.down, block);
    } else if ((block.w <= root.w) && (block.h <= root.h)) {
      return root;
    } else if ((block.h <= root.w) && (block.w <= root.h)) {
      let temp = block.w;
      block.w = block.h;
      block.h = temp;
      block.rotate = !block.rotate;
      return root;
    } else
    return null;
  },

  splitNode: function(node, block) {
      node.used = true;
      node.down  = { x: node.x, y: node.y + block.h, w: node.w, h: node.h - block.h };
      node.right = { x: node.x + block.w, y: node.y, w: node.w - block.w, h: block.h };
      return node;
  }
}
