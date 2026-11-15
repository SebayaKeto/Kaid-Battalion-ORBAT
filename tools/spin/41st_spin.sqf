SPIN_BILLET = "rifleman-dc-15c";
SPIN_FRAMES = 48;
SPIN_DIST = 4.2;
SPIN_FOV = 0.55;
SPIN_POSE = "";

[] spawn {
    private _u = missionNamespace getVariable ["spin", player];
    private _billet = SPIN_BILLET;
    private _n = SPIN_FRAMES;
    private _c = getPosATL _u;
    _c set [2, 0];
    private _tex = "#(argb,8,8,3)color(1,0,1,1,co)";
    private _objs = [];
    private _panel = {
        params ["_pos", "_dirUp"];
        private _o = createVehicle ["UserTexture10m_F", _pos, [], 0, "CAN_COLLIDE"];
        _o setPosATL _pos;
        _o setVectorDirAndUp _dirUp;
        _o setObjectTexture [0, _tex];
        _objs pushBack _o;
    };
    for "_a" from 0 to 345 step 15 do {
        {
            private _p = _c vectorAdd [9 * sin _a, 9 * cos _a, _x];
            [_p, [[sin _a, cos _a, 0], [0, 0, 1]]] call _panel;
            [_p, [[-sin _a, -cos _a, 0], [0, 0, 1]]] call _panel;
        } forEach [0, 6];
    };
    {
        [_c vectorAdd [_x select 0, _x select 1, 0.02], [[0, 0, 1], [0, 1, 0]]] call _panel;
        [_c vectorAdd [_x select 0, _x select 1, 0.02], [[0, 0, -1], [0, 1, 0]]] call _panel;
    } forEach [[-16, -16], [-8, -16], [0, -16], [8, -16], [16, -16], [-16, -8], [-8, -8], [0, -8], [8, -8], [16, -8], [-16, 0], [-8, 0], [0, 0], [8, 0], [16, 0], [-16, 8], [-8, 8], [0, 8], [8, 8], [16, 8], [-16, 16], [-8, 16], [0, 16], [8, 16], [16, 16]];

    setDate [2035, 6, 21, 12, 0];
    0 setOvercast 0;
    _u disableAI "ALL";
    if (SPIN_POSE != "") then { _u switchMove SPIN_POSE; };
    sleep 1;
    _u enableSimulation false;

    private _cam = "camera" camCreate (_c vectorAdd [0, SPIN_DIST, 1.2]);
    _cam cameraEffect ["internal", "back"];
    showCinemaBorder false;
    showHUD false;
    showChat false;
    cameraEffectEnableHUD false;

    private _target = _c vectorAdd [0, 0, 0.95];
    private _start = getDir _u;
    private _failed = 0;

    for "_i" from 0 to (_n - 1) do {
        private _a = _start + _i * 360 / _n;
        private _p = _c vectorAdd [SPIN_DIST * sin _a, SPIN_DIST * cos _a, 1.25];
        _cam camPrepareTarget _target;
        _cam camPreparePos _p;
        _cam camPrepareFOV SPIN_FOV;
        _cam camCommitPrepared 0;
        waitUntil { camCommitted _cam };
        sleep 0.4;
        private _num = if (_i < 10) then { format ["0%1", _i] } else { str _i };
        if !(screenshot format ["41st_%1_%2.png", _billet, _num]) then { _failed = _failed + 1; };
        sleep 0.25;
    };

    _cam cameraEffect ["terminate", "back"];
    camDestroy _cam;
    { deleteVehicle _x } forEach _objs;
    _u enableSimulation true;
    showHUD true;
    showChat true;

    if (_failed > 0) then {
        hint format ["SPIN DONE with %1 missed shots. The Screenshots folder is probably full (250 MB). Move the files out and run again.", _failed];
    } else {
        hint format ["SPIN DONE: %1, %2 shots saved.", _billet, _n];
    };
};
