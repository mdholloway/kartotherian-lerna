// ---------------------------------------------------------------------
// Common Colors

// You don't need to set up @variables for every color, but it's a good
// idea for colors you might be using in multiple places or as a base
// color for a variety of tints.
// Eg. @water is used in the #water and #waterway layers directly, but
// also in the #water_label and #waterway_label layers inside a color
// manipulation function to get a darker shade of the same hue.
@land: #f8f4f0;
@water: #a0c8f0;

@state_text:        #765;
@state_halo:        @place_halo;

Map {
  background-color:@land;
}

// ---------------------------------------------------------------------
// Political boundaries

#admin {
  opacity: 0.5;
  line-join: round;
  line-color: #446;
  [maritime=1] {
    // downplay boundaries that are over water
    line-color: @water;
  }
  // Countries
  [admin_level=2] {
    line-width: 0.8;
    line-cap: round;
    [zoom>=4] { line-width: 1.2; }
    [zoom>=6] { line-width: 2; }
    [zoom>=8] { line-width: 4; }
    [disputed=1] {
      line-dasharray: 4,4;
      [zoom>=8] { line-dasharray: 7,7; }
    }
  }
  
  // States / Provices / Subregions
  [admin_level>=3] {
    line-width: 0.3;
    line-dasharray: 10,3,3,3;
    [zoom>=6] { line-width: 1; }
    [zoom>=8] { line-width: 1.5; }
    [zoom>=12] { line-width: 2; }
  }
}
  // States / Provices / Subregions
#state_label[zoom>=4][zoom<=10] {
  text-name: [abbr];
  text-face-name: @sans_lt;
  text-placement: point;
  text-fill: @state_text;
  text-halo-fill: fadeout(lighten(@land,5%),50%);
  text-halo-radius: 1;
  text-halo-rasterizer: fast;
  text-size: 9;
  [zoom>=5][area>100000],
  [zoom>=6][area>50000],
  [zoom>=7][area>10000],
  [zoom>=8][area<=10000] {
    text-name: @name;
  }
  [zoom>=5][zoom<=6] {
    [area>10000] { text-size: 12; }
    [area>50000] { text-size: 14; }
    text-wrap-width: 40;
  }
  [zoom>=7][zoom<=8] {
    text-size: 14;
    [area>50000] { text-size: 16; text-character-spacing: 1; }
    [area>100000] { text-size: 18; text-character-spacing: 3; }
    text-wrap-width: 60;
  }
  [zoom>=9][zoom<=10] {
    text-halo-radius: 2;
    text-size: 16;
    text-character-spacing: 2;
    [area>50000] { text-size: 18; text-character-spacing: 2; }
    text-wrap-width: 100;
  }
}

// ---------------------------------------------------------------------
// Water Features 

#water {
  polygon-fill: @water - #111;
  // Map tiles are 256 pixels by 256 pixels wide, so the height 
  // and width of tiling pattern images must be factors of 256. 
  polygon-pattern-file: url(pattern/wave.png);
  [zoom<=5] {
    // Below zoom level 5 we use Natural Earth data for water,
    // which has more obvious seams that need to be hidden.
    polygon-gamma: 0.4;
  }
  ::blur {
    // This attachment creates a shadow effect by creating a
    // light overlay that is offset slightly south. It also
    // create a slight highlight of the land along the
    // southern edge of any water body.
    polygon-fill: #f0f0ff;
    comp-op: soft-light;
    image-filters: agg-stack-blur(1,1);
    image-filters-inflate: true;
    polygon-geometry-transform: translate(0,1);
    polygon-clip: false;
  }
}

#waterway {
  line-color: @water * 0.9;
  line-cap: round;
  line-width: 0.5;
  [class='river'] {
    [zoom>=12] { line-width: 1; }
    [zoom>=14] { line-width: 2; }
    [zoom>=16] { line-width: 3; }
  }
  [class='stream'],
  [class='stream_intermittent'],
  [class='canal'] {
    [zoom>=14] { line-width: 1; }
    [zoom>=16] { line-width: 2; }
    [zoom>=18] { line-width: 3; }
  }
  [class='stream_intermittent'] { line-dasharray: 6,2,2,2; }
}

// ---------------------------------------------------------------------
// Landuse areas 

#landuse {
  // Land-use and land-cover are not well-separated concepts in
  // OpenStreetMap, so this layer includes both. The 'class' field
  // is a highly opinionated simplification of the myriad LULC
  // tag combinations into a limited set of general classes.
  [class='park'] { polygon-fill: #d8e8c8; }
  [class='cemetery'] { polygon-fill: mix(#d8e8c8, #ddd, 25%); }
  [class='hospital'] { polygon-fill: #fde; }
  [class='school'] { polygon-fill: #f0e8f8; }
  ::overlay {
    // Landuse classes look better as a transparent overlay.
    opacity: 0.1;
    [class='wood'] { polygon-fill: #6a4; polygon-gamma: 0.5; }
  }
}

// ---------------------------------------------------------------------
// Buildings 

#building [zoom<=17]{
  // At zoom level 13, only large buildings are included in the
  // vector tiles. At zoom level 14+, all buildings are included.
  polygon-fill: darken(@land, 50%);
  opacity: 0.1;
}
// Seperate attachments are used to draw buildings with depth
// to make them more prominent at high zoom levels
#building [zoom>=18]{
::wall { polygon-fill:mix(@land, #000, 85); }
::roof {
  polygon-fill: darken(@land, 5%);
  polygon-geometry-transform:translate(-1,-1.5);
  polygon-clip:false;  
  line-width: 0.5;
  line-color: mix(@land, #000, 85);
  line-geometry-transform:translate(-1,-1.5);
  line-clip:false;
 }
}

// ---------------------------------------------------------------------
// Aeroways 

#aeroway [zoom>=12] {
  ['mapnik::geometry_type'=2] {
    line-color: @land * 0.96;
    [type='runway'] { line-width: 5; }    
    [type='taxiway'] {  
      line-width: 1;
      [zoom>=15] { line-width: 2; }
    }
  }    
  ['mapnik::geometry_type'=3] {
    polygon-fill: @land * 0.96;
    [type='apron'] {
      polygon-fill: @land * 0.98;  
    }  
  }
}

