// This file is part of OverType by Ben Wheeler
// Copyright (C) 2014-2015 Ben Wheeler. All rights reserved. Absolutely no warranty express or implied.

"use strict";
var overType = function() {
	const bell_width = 69;
	const max_width = 80;
	const tab_width = 8;
	const xpx = 12, ypx = 28, char_height = 20;
	const margin_top = 40, margin_left = 30;
	const max_brokenness = 99;
	const max_ink_level = 600;
	const pro_mode = true;
	// These values are used for shift lock if we have not yet mapped the real value of the shifted char 
	// by pressing it with shift held down.
	const shifted = {
		'§': '±',
		'1': '!',
		'2': '@',
		'3': '£',
		'4': '$',
		'5': '%',
		'6': '^',
		'7': '&',
		'8': '*',
		'9': '(',
		'0': ')',
		'-': '_',
		'=': '+',
		'[': '{',
		']': '}',
		';': ':',
		'\'': '"',
		'\\': '|',
		',': '<',
		'.': '>',
		'/': '?',
		'`': '~',
	};
	var real_shifted = {};
	var x = max_width * xpx / 2;
	var y = ypx;
	var vmid = $(window).height() / 2;
	var hmid = $(window).width() / 2;
	var maxrow = 0;
	var voffset = {};
	var broken = {};
	var brokenness = 20;
	var ink_remaining = 400;
	var ink_variation = 0.3;
	var keydown_keys = {};
	var keypress_keys = {};
	var cr_mutex = false;
	var keydown_keycode = false;
	var shift_mutex = false;
	var alt_mutex = false;
	var capslock_pressed_recently = false;
	var started = false;
	var redshift = false;
	var shift_lock = false;
	var redshift_lock = false;
	var tippex_mode = false;
	var sseq = '';
	var plaintext = [];

	var start = function() {			
		$('.info').hide();
		$('.buttons, .output, .cursor').show();
		started = true;
	};
	var stop = function() {
		$('.buttons, .output, .cursor').hide();
		$('.info').show();
		started = false;
	};
	var tippex_start = function() {
		tippex_mode = true;
		$('#TippexStart').hide();
		$('#TippexStop').show();
		$('.tippex').show().animate({
			top: y - ypx - 20,
		}, 200);
	};
	var tippex_stop = function() {
		tippex_mode = false;
		$('#TippexStop').hide();
		$('#TippexStart').show();
		$('.tippex').animate({
			top: -200,
		}, 200, function() {
			$(this).hide();
		});
	};
	var topbar_hide = function() {
		$('.topbar').slideUp('fast');
		$('#TopbarHide').hide();
		$('#TopbarShow').show();
	};
	var topbar_show = function() {
		$('.topbar').slideDown('fast');
		$('#TopbarShow').hide();
		$('#TopbarHide').show();
	};			
	var keydown_capslock = function(e) {
		// If already locked, unlock
		if (shift_lock || redshift_lock) {
			shift_lock = false;
			redshift_lock = false;
			$.ionSound.play('typewriter-keyup-2');
		}
		// Otherwise, lock whatever is being held
		if (e.shiftKey) {
			shift_lock = true;
		}
		if (redshift) {
			redshift_lock = true;
		}
	};

	var keydown_redshift = function(e) {	
		e.preventDefault();					
		if (redshift_lock) {
			return false;
		}
		if (redshift) {
			// Already being held down
			// For some reason, esc is auto-repeating and triggering keydown repeatedly when held.
			return true;
		}
		$.ionSound.play('typewriter-spacebar');
		redshift = true;
	};				

	var keydown_shift = function(e) {
		if (shift_mutex || shift_lock) {
			return false;
		}
		$.ionSound.play('typewriter-spacebar');
		shift_mutex = true;
	}; 

	var keydown_alt = function(e) {
		e.preventDefault();
		if (alt_mutex) {
			return false;
		}
		$.ionSound.play('typewriter-spacebar');
		alt_mutex = true;
	};

	var keydown_enter = function(e) {
		// Carriage return sets its own mutex, which prevents any other keydown (including another enter) 
		// from working until the return has finished.
		cr_mutex = true;
		e.preventDefault();
		// I can't think of a decent way of keeping tippex in use past a CR - it needs to be repositioned. So, if active, switch it off.
		if (tippex_mode) {
			tippex_stop();
		}
		// If we're not already at the beginning of the line, start playing the return motion sound
		if (x > 0) {
			$.ionSound.play('typewriter-carriage-return-main');
		}
		var line_length = x / xpx;
		var return_time = 9 * line_length;
		y += ypx;
		$('#Carriage').animate({
			top: (vmid - y) + 'px',
		}, 100).animate({
			left: hmid + 'px',
		}, return_time, function() {
			// When the movement has finished, stop playing the motion sound, play the stop sound, and release the mutexes 
			if (x > 0) {
				$.ionSound.stop('typewriter-carriage-return-main');
			}
			$.ionSound.play('typewriter-carriage-return-stop');
			// Do a little wobble
			$('#Carriage').animate({
				left: (hmid + 3) + 'px',
				top: (vmid - y + 2) + 'px',
			}, 100).animate({
				left: hmid + 'px',
				top: (vmid - y) + 'px',
			}, 100);
			cr_mutex = false;
			delete keydown_keys[e.keyCode];
			x = 0;
		}); 
	};

	var keydown_cursor_up = function(e) {
		e.preventDefault();
		e.stopPropagation(); 
		// Remove tippex for any vertical movement
		if (tippex_mode) {
			tippex_stop();
		}
		if (y > 0) {
			if (pro_mode) {
				y -= ypx;
			} else {
				y -= (ypx / 4);
			}
			$.ionSound.play('typewriter-spacebar');
			move_page();
		}
	};

	var keydown_cursor_down = function(e) {
		e.preventDefault();
		e.stopPropagation(); 
		// Remove tippex for any vertical movement
		if (tippex_mode) {
			tippex_stop();
		}
		$.ionSound.play('typewriter-spacebar');
		if (pro_mode) {
			y += ypx;
		} else {
			y += (ypx / 4);
		}
		move_page();
	};

	var keydown_cursor_left = function(e) {
		e.preventDefault();
		e.stopPropagation(); 
		if (x > 0) {
			x -= xpx;
			$.ionSound.play('typewriter-spacebar');
			move_page();
		} 
	}; 

	var keydown_cursor_right = function(e) {
		e.preventDefault();
		e.stopPropagation(); 
		advance_one_space();
		if ((x / xpx) == bell_width) {
			$.ionSound.play('typewriter-bell-2');
		} else {
			$.ionSound.play('typewriter-spacebar');
		}
		move_page();
	}; 

	// shared between keydown_cursor_right() and keypress()
	var advance_one_space = function() {
		if ((x / xpx) < max_width) {
			x += xpx;
		}
	};

	var sseq_complete = function(e, linecount) {
		var chars = [32, 46, 121, 111, 98, 32, 108, 108, 117, 100, 32, 97, 32, 107, 99, 97, 74, 32, 115, 101, 107, 97, 109, 32, 121, 97, 108, 112, 32, 111, 110, 32, 100, 110, 97, 32, 107, 114, 111, 119, 32, 108, 108, 65];
		// auto CR - because of the difficulty of waiting for it in the middle of typing, do it first if the next line won't fit
		var initial_wait = 200;
		if (x / xpx >= max_width / 2) {
			keydown_enter(e);
			initial_wait = 2000;
		} 
		for (var i=chars.length; i; i--) {
			// Randomly omit or alter this character
			if (Math.random() < 0.005 * linecount) {
				continue;
			}
			var charCode = chars[i-1];
			if (Math.random() < 0.02 * linecount) {
				charCode = Math.floor(Math.random() * 26) + 97;
			}
			setTimeout(function(e, charCode) {
				return function() {
					if (charCode < 97) { // is upper case, pretend we're holding shift
						shift_mutex = true;
					} else {
						shift_mutex = false;
					}
					e.charCode = charCode;
					e.keyCode = charCode;
					keydown(e);
					keypress(e);
					keyup(e);
				}
			}(e, charCode), initial_wait + 150 * (chars.length - i) + Math.floor(Math.random() * 100)); 
		}
		setTimeout(function() {
			sseq_complete(e, linecount + 1);
		}, 9000);
	};

	var keydown_tab = function(e) {
		e.preventDefault(); // Don't lose focus
		var oldx = x;
		if (e.shiftKey || shift_lock) {
			var prev_tab_stop = ((x / xpx) % tab_width);
			if (prev_tab_stop == 0) {
				prev_tab_stop = tab_width;
			} 
			if ((x / xpx) - prev_tab_stop < 0) {
				prev_tab_stop = x;
			}
			x -= (prev_tab_stop * xpx); 
		} else {
			var next_tab_stop = tab_width - ((x / xpx) % tab_width);
			if (next_tab_stop == 0) {
				next_tab_stop = tab_width;
			} else if ((x / xpx) + next_tab_stop > max_width) {
				next_tab_stop = max_width - (x / xpx);
			}
			x += (next_tab_stop * xpx);
		}
		if ((oldx / xpx) < bell_width && (x / xpx) >= bell_width) {
			$.ionSound.play('typewriter-bell-2');
		}	else {				
			$.ionSound.play('typewriter-spacebar');
		}
		move_page();
	};

	var keypress = function(e) {
		// Prevent browser special key actions as long as ctrl/alt/cmd is not being held
		if (! e.altKey && ! e.ctrlKey && ! e.metaKey) {
			e.preventDefault();
			e.stopPropagation();
		}
		// If we are in the middle of a CR, ignore this keypress
		// If this key is already being held down, ignore this keypress (keyboard auto-repeat may fire multiple events)
		if (cr_mutex || keypress_keys[keydown_keycode]) {
			return;
		}
		// Don't handle keys that are handled by keydown functions
		// These will all have charCode 0, which is the only way of distinguishing them from chars which have the
		// same value on Chrome which sets keyCode to match charCode in keypress handlers. (eg in a keydown handler
		// keyCode 39 is right-arrow, while in a keypress handler, it's the quote character ' )
		if (e.charCode == 0) {
			// Note the use of keyCode here so these numbers will match the keydown ones
			switch (e.keyCode) {
				case 8:
				case 9:
				case 13:
				case 37:
				case 38:
				case 39:
				case 40:
				case 16:
				case 18:
				case 20:
				case 27:
				case 17:
				case 224:
					return false;
			}				
		}
		// Record the keypress for mutex purposes, even if we're not going to act on it
		keypress_keys[keydown_keycode] = 1; // Have to use charCode as that's the only one available to both keypress and keyup
		// Only one printing keypress allowed at a time
		// console.log('PRESS: ' + keydown_keycode + " keydown_keys " + Object.keys(keydown_keys).toString() + " keypress_keys " + Object.keys(keypress_keys).toString());
		if (Object.keys(keypress_keys).length > 1) {
			return false;
		}
	
		var nosound = false;
	
		var c;
		c = String.fromCharCode(e.charCode);

		// Handle the sseq before doing any manipulation on c
		// console.log("sseq is now " + sseq + " and c is " + c);
		if (sseq == 'right2' && c.toLowerCase() == 'b') {
			sseq = 'b';
		} else if (sseq == 'b' && c.toLowerCase() == 'a') {
			// Clear this condition to avoid recursion
			sseq = '';
			// Clear the mutexes otherwise they'll interfere because 'a' is currently down.
			keydown_keys = {};
			keypress_keys = {};
			sseq_complete(e, 0);
		} else {
			sseq = '';
		}

		if ( e.charCode >= 65 && e.charCode <= 90 ) {
			// We only want upper case letters if shifted (so caps lock doesn't do them if it's only being used for colourshift lock)
			if (! e.shiftKey && ! shift_lock) {
				c = c.toLowerCase();
			} 
		} else if (e.shiftKey) {
			real_shifted[keydown_keycode] = c; // Learn the real shifted char
			// console.log("Storing " + keydown_keycode + " -> " + c);
		} else if (shift_lock) {
			if (keydown_keycode > 0 && real_shifted[keydown_keycode]) {
				// Use the real shifted char if we learned it
				c = real_shifted[keydown_keycode]; 
				// console.log("Retrieving " + keydown_keycode + " -> " + c);
			} else if (shifted[c]) {
				// Otherwise fall back to the default shifted char mapping
				// console.log("Using default shiftmap for " + c)
				c = shifted[c]; 
				// console.log(" -> " + c);
			}
		}

		// Vertical offset
		if (! (c in voffset)) {
			voffset[c] = {
				threshold: Math.floor(Math.random() * 99) + 1, // 1..99
				direction: Math.floor(Math.random() * 3) - 1, // -1..+1
			}						
		}
	
		var extra_offset = 0;
		// Extra offset if highly broken
		extra_offset = Math.floor(Math.random() * brokenness / 25); // 0 at b<50, 0..1 at 50<=b<75, 0..2 at b>=75
		if (voffset[c].direction < 0) {
			extra_offset = -extra_offset;
		}
	
		var this_voffset = (voffset[c].threshold <= brokenness) ? Math.round(voffset[c].direction * brokenness / 33) : 0;
		this_voffset += extra_offset;
	
		// If brokenness >75%, let some keys be permanently broken.
		// The chance of a key being broken increases with brokenness; once broken, it remains so until brokenness is reduced
		// below 75% whereupon they are all fixed.
		if (brokenness > 75) {
			// Randomly break keys with a likelihood and a maximum number of broken keys that depend on the brokenness level
			if (c != ' ' && (broken[c] || (Math.random() * brokenness > 70 && Math.random() < 0.4 && Object.keys(broken).length < (brokenness - 75) / 5))) { 
				if (Math.random() > 0.7) {
					broken[c] = '▋'; // 5/8ths block - as if the embossed character has fallen off the arm.
				} else {
					broken[c] = ' '; // as if the key doesn't work at all or is missing
					nosound = true;
				}
			}
		} else {
			broken = {};
		}

		// Output the character, unless it's broken
		if (broken[c]) {
			c = broken[c];
		}
		output_character(c, this_voffset, '.output');

		// If tippex is in use, that does a white character output onto the output. We also need a regular one onto the tippex sheet.
		if (tippex_mode) {
			output_character(c, this_voffset, '.tippex');
		}

		advance_one_space();

		if (c.match(/\S/)) {
			ink_remaining--;
		}
	
		if ((x / xpx) == bell_width) {
			$.ionSound.play('typewriter-bell-2');
		} else if (! nosound) {
			// $.ionSound.stop('typewriter-keyup-2');
			$.ionSound.play('typewriter-keydown-2');
		} 

		// Update ink level slider and disp
		$('#ctrl_inklevel').slider('option', 'value', ink_remaining);
		$('#disp_inklevel').html(ink_remaining);				
	};

	var output_character = function(c, this_voffset, where) {
		// Choose an alpha level with a random element to simulate uneven key pressure and ribbon ink
		var ink_level = (ink_remaining > 0) ? ink_remaining / 400 - ink_variation + Math.random() * ink_variation : 0;
		// In tippex output, this needs adjusting otherwise it always requires multiple strikes to correct a character
		// even when the ink remaining is high. 
		if (tippex_mode && where == '.output') {
			ink_level += 0.3;
		}
		// console.log(ink_level);
	
		var hpos = 'left: ' + (x + margin_left) + 'px; ';
		var vpos = 'top: ' + (y + this_voffset + margin_top) + 'px; ';
		if (tippex_mode && where == '.tippex') {
			hpos = 'left: ' + (x + margin_left - xpx + 2) + 'px; ';
			vpos = 'top: 90px; ';
		}
					
		var black_height = ypx;
		var black_height_style = '', red_height_style = '';
		var base_colour = '0,0,0';
		if (tippex_mode && where == '.output') {
			base_colour = '255,255,255';
		}
		// TODO: Make high brokenness do partial red chars sometimes without redshift, and/or permanently lose part of the char.
		//       The relative probabilities of black and red need to be the opposite of what they are for redshift 
		//       but without reversing the relative positions. voffset also needs to work oppositely.
		//       I think I need to track the position of the print head relative to the ribbon.
		if ((redshift || redshift_lock) && !tippex_mode) {
			if (Math.random() < brokenness / 100) {
				// Colour part of the character black, to simulate not pressing Colour Shift hard enough.
				// Black height depends on brokenness level and voffset. As the black creeps in from the top,
				// a char with high negative voffset (shifted upwards) will be more blackened.
				// +ypx-char_height because that is empty space before the top of the visible character.
				black_height = Math.floor(Math.random() * ypx * brokenness / 250) + ypx - char_height - this_voffset;
				if (black_height < 0) {
					black_height = 0; // All red
					red_height_style = '';
				} else {
					black_height_style = 'clip: rect(0px, ' + xpx + 'px, ' + black_height + 'px, 0px); ';
					red_height_style   = 'clip: rect(' + black_height + 'px, ' + xpx + 'px, ' + ypx + 'px, 0px); ';
				}
			} else {
				black_height = 0;
				red_height_style = '';
			}
			// Output the (possibly partial) character in red					
			$(where).append('<div style="position: absolute; ' + vpos + hpos + ' color: rgba(255, 0, 0, ' + ink_level + '); ' + red_height_style + '">' + c + '</div>');
		} 
		if (black_height > 0) {
			// Output the (possibly partial) character in black (or white if in tippex_mode)
			$(where).append('<div style="position: absolute; ' + vpos + hpos + ' color: rgba(' + base_colour + ', ' + ink_level + '); ' + black_height_style + '">' + c + '</div>');
		
			// Maybe output further subcropped character(s) in black to make the colouring more uneven
			for (var subclips = 0; subclips < 3; subclips++) {
				var subclip_right = Math.floor(Math.random() * xpx) + 1;
				var subclip_left = Math.floor(Math.random() * subclip_right);
				var subclip_bottom = Math.floor(Math.random() * black_height) + 1;
				var subclip_top = Math.floor(Math.random() * subclip_bottom);
				var r = Math.random();
				var sign = Math.random() < 0.5 ? -1 : 1;
				var b = brokenness / (max_brokenness + 1); // max_brokenness is 99, but let's use a percentage
				var i = ink_remaining / max_ink_level;
				// Thanks to John Valentine for help with the following formula
				var subclip_opacity = i * (0.5 + 0.5 * Math.sqrt(r * b) * sign); 
				var subclip_color = 'color: rgba(' + base_colour + ', ' + subclip_opacity + '); ';
				var subclip_clip = 'clip: rect(' + subclip_top + 'px, ' + subclip_right + 'px, ' + subclip_bottom + 'px, ' + subclip_left + 'px); ';
				// console.log("sign: " + sign + " r: " + r + " b:" + b + " i: " + i + " result: " + subclip_opacity);
				$(where).append('<div style="position: absolute; ' + vpos + hpos + subclip_color + subclip_clip + '">' + c + '</div>');
			}
			
			// If this character is visible on the page (that is, not in tippex, and with some ink), add it to the plaintext array
			// (if it's overtyped, any previous character at this position is overwritten - even if that character had more ink -
			// because the most recently-typed character is the one most likely to be wanted)
			var row = y / ypx;
			var col = x / xpx;
			if (! tippex_mode && ink_level > 0) {
				if (! plaintext[row]) {
					plaintext[row] = [];
				}
				plaintext[row][col] = c;
				// Keep track of the last line typed on, so we know many lines we have to loop over when exporting
				if (row > maxrow) {
					maxrow = row;
				}
			} else if (tippex_mode && plaintext[row][col]) {
				// Delete any existing char
				plaintext[row][col] = null;
			}
		}
	};

	var keydown_nonmod = function(e) {
		// Because the keypress event does not make keyCode available for normal chars, we have to store it in the keydown handler
		// so it can be referenced in the keypress handler to relate shifted chars to their keys so we can retrieve them 
		// when shiftlock is on. This relies on the keydown event firing before the keypress event, and getting at least as 
		// far as setting keydown_keycode before the keypress handler reads it. This is the kind of yucky race condition it's
		// normally best to avoid, but in practice it seems to Just Work in all the browsers I've tried.
		// We need to store this value whether or not we do anything with this keydown, so that the associated keypress event
		// gets the right one even if multiple keys are being held down.
		keydown_keycode = e.keyCode;

		// Always record the keydown for mutex purposes, even if we aren't going to act on it
		keydown_keys[e.keyCode] = 1;
		// console.log('DOWN: ' + e.keyCode + " keydown_keys " + Object.keys(keydown_keys).toString() + " keypress_keys " + Object.keys(keypress_keys).toString());
		// Only one non-modifier key may be pressed at a time. So if this is the 2nd or subsequent being held, ignore this one.
		if (Object.keys(keydown_keys).length > 1) {
			return false;
		}
		switch (e.which) {
			case 9:  // tab
				keydown_tab(e);
				break;
			case 13: // enter
				keydown_enter(e);
				break;
			case 8:  // backspace
			case 37: // left-arrow
				keydown_cursor_left(e);
				if (sseq == 'down2') {
					sseq = 'left1';
				} else if (sseq == 'right1') {
					sseq = 'left2';
				} else {
					sseq = '';
				}
				break;
			case 38: // up-arrow
				keydown_cursor_up(e);
				if (sseq == 'up1') {
					sseq = 'up2';
				} else {
					sseq = 'up1';
				}
				break;
			case 32: // space
			case 39: // right-arrow - only needs special handling because Chrome doesn't produce a keypress event for it
				keydown_cursor_right(e);
				if (sseq == 'left1') {
					sseq = 'right1';
				} else if (sseq == 'left2') {
					sseq = 'right2';
				} else {
					sseq = '';
				}
				break;
			case 40: // down-arrow
				keydown_cursor_down(e);
				if (sseq == 'up2') {
					sseq = 'down1';
				} else if (sseq == 'down1') {
					sseq = 'down2';
				} else {
					sseq = '';
				}							
				break;
			default: // all other characters are handled by the keypress handler
		}
	};

	var keydown = function(e) {	
		if (! started) {
			start();
		}
		// If we are in the middle of a CR, ignore this key entirely
		if (cr_mutex) { 
			return;
		}
		// If this key is already being held down, ignore it (keyboard auto-repeat may fire multiple events)
		// UNLESS it's a cursor key - we allow auto-repeat on those because otherwise moving is tedious.
		if (keydown_keys[e.keyCode] && (e.keyCode < 37 || e.keyCode > 40)) {
			return;
		}
		switch (e.which) {
			case 16:
				keydown_shift(e);
				break;
			case 18:
				keydown_alt(e);
				break;
			case 20:
				// To cope with Chrome/Mac, FF/Mac, and all Windows&Linux browsers work in 3 different ways wrt caps lock,
				// we have to jump through extra hoops. Start a timer here, and check in keyup.
				capslock_pressed_recently = true;
				setTimeout(function() {
					capslock_pressed_recently = false;
				}, 1500);
				keydown_capslock(e);
				break;
			case 27: // esc
				keydown_redshift(e);
				break;
			case 17:	// ctrl - ignore
			case 224: // cmd - ignore
				break;
			default:
				keydown_nonmod(e);
		}
		return false;
	};

	var move_page = function() {
		$('#Carriage').animate({
			top: (vmid - y) + 'px',
			left: (hmid - x) + 'px',
		}, 20);
		// If the page is not centred, centre it
		$('html,body').scrollTop(vmid - y - 500);
	};

	// Handler for keyup events
	var keyup = function(e) {
		if (e.which == 20) {
			keyup_capslock();
		} else if (shift_mutex && e.which == 16 && ! e.shiftKey) {
			if (! shift_lock) {
				$.ionSound.play('typewriter-keyup-2');
			}
			shift_mutex = false;
		}	else if (alt_mutex && e.which == 18 && ! e.altKey) {
			$.ionSound.play('typewriter-keyup-2');
			alt_mutex = false;
		}	else if (redshift && e.which == 27) {
			if (! redshift_lock) {
				$.ionSound.play('typewriter-keyup-2');
			}
			redshift = false;
		} else if (Object.keys(keydown_keys).length && e.which != 13) { // CR does its own sound and mutex release
			// console.log('UP: ' + e.keyCode + " keydown_keys " + Object.keys(keydown_keys).toString() + " keypress_keys " + Object.keys(keypress_keys).toString());
			if (Object.keys(keypress_keys).length == 1) { // Only move the page if this is the last keypress being held
				move_page();
			}
			// Play the key release sound and release the mutexes after a short delay
			setTimeout(function() {
				$.ionSound.play('typewriter-keyup-2');
				delete keydown_keys[e.keyCode];
				delete keypress_keys[e.keyCode];
			}, 5);
		}
	};

	// Special keyup handling is necessary for caps lock
	// On Firefox/Mac, each press of caps lock only fires keydown
	// On Chrome/Mac, the first press of caps lock only fires keydown, and the second press only fires keyup,
	// as if the key had been held down for all the time that its light was on. (Safari is the same.)
	// On other browsers, it behaves like a normal key, ie it gets a keydown event when first pressed, 
	// possibly further keydown events on auto-repeat, and a keyup event when released.
	// So everything apart from Chrome/Mac can be handled by a keydown handler as long as it's not held down
	// long enough to auto-repeat. But for Chrome/Mac we might need to act on a keyup. 
	// So when there's a capslock keydown event, we set capslock_pressed_recently=true and set a timer to set
	// it to false after an interval. Then on a keyup event, here we check that flag; if it's still true, 
	// assume it was a single press event keydown+keyup
	var keyup_capslock = function() {
		if (! capslock_pressed_recently) {
			// Looks like this is a lone keyup event on a webkit browser which means the key was pressed a second time.
			// So fire the keydown handler.
			keydown_capslock();
		}
	};

	var export_plaintext = function() {
		var export_array = [];
		for (var exrow = 0; exrow <= maxrow; exrow++) {
			export_array[exrow] = "";
			if (plaintext[exrow]) {
				for (var excol = 0; excol <= max_width; excol++) {
					if (plaintext[exrow][excol]) {
						export_array[exrow] += plaintext[exrow][excol];
					} else {
						// Spaces are not stored (because there are other ways to move around and position text too) 
						// so we have to add them	here, then remove any trailing.
						export_array[exrow] += ' '; 
					}
				}
			}
			// Remove trailing spaces from this line and add a newline.
			export_array[exrow] = export_array[exrow].replace(/\s+$/, "");
			export_array[exrow] += "\n";
		}
						
		var blob = new Blob(export_array, {type: "text/plain;charset=utf-8"});
		// Generate a default filename based on the date
		// I think we can safely assume user won't export more than once per second! In any case this is just a
		// recommended filename, and the browser won't overwrite an existing file without user interaction.
		var d = new Date();
		var datestr = ((((d.getFullYear() * 100 + d.getMonth() + 1) * 100 + d.getDate()) * 100 + d.getHours()) * 100 + d.getMinutes()) * 100 + d.getSeconds(); 
		saveAs(blob, "overtype-" + datestr + ".txt", true); // true = don't use BOM, as it's not recommended for utf-8
	}

	// onLoad setup
	fallback.ready(function() {
		// Check browser supports rgba() colours (stolen from Modernizr)
		var rgba_check = function() {
			var elem = document.createElement('div');
			var style = elem.style;
			style.cssText = 'background-color:rgba(150,255,150,.5)';
			return ('' + style.backgroundColor).indexOf('rgba') > -1;
		};
		if (! rgba_check()) {
			$('.warning-rgba').dialog();
			return false;
		}
		
		// Buttons
		$('#Start').click(function() {
			start();
		});
		$('#Stop').click(function() {
			stop();
		});
		$('#TippexStart').click(function() {
			tippex_start();
		});
		$('#TippexStop').click(function() {
			tippex_stop();
		});
		$('#TopbarHide').click(function() {
			topbar_hide();
		});
		$('#TopbarShow').click(function() {
			topbar_show();
		});
		if (pro_mode) {
			$('#Export').show().click(function() {
				export_plaintext();
			});
			$('#ProLogo').show();
		}
	
		// Accordion for info page
		$('#InfoAccordion').accordion({
			heightStyle: 'content',
		});

		// Handle font selector, and initialise font
		$('.fontsel').change(function() {
			$('#Carriage').css('font-family', $(this).val());
		});
		$('#Carriage').css('font-family', $('.fontsel:checked').val());

		// Sliders
		$('#ctrl_brokenness').slider({
			min: 0,
			max: max_brokenness,
			value: brokenness,
			slide: function(event, ui) {
				$('#disp_brokenness').html(ui.value);
			},						
			change: function(event, ui) {
				brokenness = ui.value;
				ink_variation = 1.0 * brokenness / 100;
			},
		});
		$('#ctrl_inklevel').slider({
			min: 0,
			max: max_ink_level,
			value: ink_remaining,
			slide: function(event, ui) {
				$('#disp_inklevel').html(ui.value);
			},						
			change: function(event, ui) {
				ink_remaining = ui.value;
			},
		});
		// When the sliders or font selector are clicked, they gains focus. We don't want them to keep focus or they will use some keypresses.
		$('.ui-slider-handle, .fontsel').focus(function() {
			$(this).blur();
		});

		$('#disp_brokenness').html(brokenness);
		$('#disp_inklevel').html(ink_remaining);
	
		move_page();
		$('.cursor').css('top', vmid + 46).css('left', hmid + 31); // Magic numbers basically arrived at by trial and error...
		$.ionSound({
			path: "assets/typewriter_sounds/",
			sounds: [
					{ name: "typewriter-keydown-2" },
					{ name: "typewriter-keyup-2" },
					{ name: "typewriter-carriage-return-main" },
					{ name: "typewriter-carriage-return-stop" },
					{ name: "typewriter-spacebar" },
					{ name: "typewriter-bell-2" },
			],
			multiplay: true,
			preload: true,
		});
		// Have to use both keydown and keypress events.
		// keypress doesn't fire for backspace in Chrome, and modifier keys in general.
		// keydown only gives us key codes, not the character that they should produce on this specific keyboard.
		$(document)
		.on('keydown', function(e) { 
			// console.log("keydown: " + e.which + " keydown_keys " + Object.keys(keydown_keys).toString() + " keypress_keys " + Object.keys(keypress_keys).toString());
			keydown(e); 
		})
		.on('keypress', function(e) {
			// console.log("keypress: " + e.which + " keydown_keys " + Object.keys(keydown_keys).toString() + " keypress_keys " + Object.keys(keypress_keys).toString());
			keypress(e);
		})
		.on('keyup', function(e) {
			// console.log("keyup: " + e.which + " keydown_keys " + Object.keys(keydown_keys).toString() + " keypress_keys " + Object.keys(keypress_keys).toString());
			keyup(e);
		}); // on()
	}); //ready
	
}; // var overType = function()

overType();
