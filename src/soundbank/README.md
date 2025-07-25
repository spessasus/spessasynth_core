## This is the SoundFont and DLS parsing library.

The code here is responsible for parsing the SoundFont2/DLS file and
providing an easy way to get the data out.

- `basic_soundfont` folder contains the classes that represent a sound bank file. 
It also contains the code for writing the files.

- `read_sf2` folder contains the code for reading a `.sf2` file.

- `dls` folder contains the code for reading a `.dls` file (and converting in into a soundfont representation).