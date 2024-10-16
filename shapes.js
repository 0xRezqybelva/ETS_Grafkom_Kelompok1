"use strict";

// Vertex shader program
const vsSource = `
attribute vec4 aPosition;
attribute vec3 aNormal;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix; // Untuk mengubah normal ke space yang tepat
varying vec3 vNormal;
varying vec4 vPosition;

void main() {
    vPosition = uModelViewMatrix * aPosition;
    vNormal = normalize(uNormalMatrix * aNormal); // Kirim normal ke fragment shader
    gl_Position = uProjectionMatrix * vPosition;
}
`;

// Fragment shader program
const fsSource = `
precision mediump float;
uniform vec4 uColor;
uniform vec3 uAmbientLightColor;
uniform vec3 uDiffuseLightColor;
uniform vec3 uLightDirection; // Arah cahaya
varying vec3 vNormal;
varying vec4 vPosition;

void main() {
    // Hitung ambient lighting
    vec3 ambient = uAmbientLightColor * uColor.rgb;

    // Hitung diffuse lighting
    vec3 norm = normalize(vNormal);
    float diff = max(dot(norm, uLightDirection), 0.0);
    vec3 diffuse = uDiffuseLightColor * diff * uColor.rgb;

    // Gabungkan ambient dan diffuse
    vec3 finalColor = ambient + diffuse;
    gl_FragColor = vec4(finalColor, uColor.a);
}
`;

let gl, program;
let positionY = 0.0; // Inisiasi posisi objek sumbu Y
let velocityY = 0.0; // Inisiasi kecepatan objek sumbu Y
let positionX = 0.0; // Inisiasi posisi objek sumbu X
let velocityX = 0.0; // Inisiasi kecepatan objek sumbu X
const gravity = 0.01; // Gravitasi
const groundLevel = -1.0; // Agar collision dengan ground level dari canvas
let gravityEnabled = true;
let modelViewMatrix = mat4.create();
let currentShape = 'cube'; // Default shape
let projectionMatrix = mat4.create();

let rotateX = false, rotateY = false, rotateZ = false; // Default rotasi
let thetaX = 0.0, thetaY = 0.0, thetaZ = 0.0; 

let isRendering = false; // Rendering aktif atau tidak

let forceX = 0.0; // Default force
let forceY = 0.0;
let isSimulationRunning = false; // Simulasi aktif atau tidak

let selectedColor = [1.0, 0.0, 0.0, 1.0]; // Default color: red

let ambientLight = [0.5, 0.5, 0.5]; // Default ambient light color
let diffuseLightColor = [1.0, 1.0, 1.0]; // Default diffuse light color
let lightDirection = [0.0, 0.0, 1.0]; // Default light direction

let scaleX = 1.0, scaleY = 1.0, scaleZ = 1.0;

function initWebGL() {
    const canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl");
    if (!gl) {
        alert("WebGL isn't available");
        return;
    }

    // Compile shaders and link the program
    program = initShaders(gl, vsSource, fsSource);
    gl.useProgram(program);

    // Set the viewport
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Set clear color and enable depth testing
    gl.clearColor(0.2, 0.2, 0.2, 1.0); // Background abu-abu, bisa disesuaikan
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // Bersihkan buffer warna dan kedalaman
    gl.enable(gl.DEPTH_TEST); // Aktifkan depth test
    gl.disable(gl.CULL_FACE);

    // Event listener untuk mengubah warna ambient light
    document.getElementById("ambientLightColor").oninput = function() {
        ambientLight = hexToRgb(this.value).slice(0, 3); // Ambil nilai RGB dari slider
    };

    // Event listener untuk mengubah warna objek
    document.getElementById("objectColor").oninput = function() {
        const colorHex = this.value;
        selectedColor = hexToRgb(colorHex);  // Convert HEX to RGB
    };

    // Tombol ubah bentuk cube
    document.getElementById("ButtonCube").onclick = () => {
        currentShape = 'cube';
        resetRotation();  // Reset rotasi jika ingin memulai ulang rotasi
        if (!isRendering) { // Hanya memanggil render jika belum jalan
            render();
            isRendering = true; // Tanda bahwa render sudah berjalan
        }
    };

    // Tombol ubah bentuk sphere
    document.getElementById("ButtonSphere").onclick = () => {
        currentShape = 'sphere';
        resetRotation();
        if (!isRendering) {
            render();
            isRendering = true;
        }
    };

    // Tombol ubah bentuk pyramid
    document.getElementById("ButtonPyramid").onclick = () => {
        currentShape = 'pyramid';
        resetRotation();
        if (!isRendering) {
            render();
            isRendering = true;
        }
    };


    // Tombol rotasi
    document.getElementById("ButtonRotateX").onclick = () => { rotateX = !rotateX; };
    document.getElementById("ButtonRotateY").onclick = () => { rotateY = !rotateY; };
    document.getElementById("ButtonRotateZ").onclick = () => { rotateZ = !rotateZ; };

    document.getElementById("ButtonReset").onclick = () => {
        rotateX = false;
        rotateY = false;
        rotateZ = false;
        thetaX = 0.0;
        thetaY = 0.0;
        thetaZ = 0.0;
        positionY = 0.5; // Reset posisi kubus
        positionX = 0.0; // Reset posisi X
        velocityX = 0.0; // Reset kecepatan X
        velocityY = 0.0; // Reset kecepatan Y
        gravityEnabled = false; // Nonaktifkan gravitasi saat reset
    };

    document.getElementById("applyForce").onclick = () => {
        forceX = parseFloat(document.getElementById("forceX").value) || 0;
        forceY = parseFloat(document.getElementById("forceY").value) || 0;
        velocityX = forceX * 0.01; // Sesuaikan skala kecepatan dengan gaya input
        velocityY = forceY * 0.01; 
    };

     // Start Simulation button
    document.getElementById("startSimulation").onclick = () => {
         isSimulationRunning = true;
    };
    
    // Stop Simulation button
    document.getElementById("stopSimulation").onclick = () => {
        isSimulationRunning = false;
    };

    render(); // Render awal

    document.getElementById("scaleX").oninput = function() {
        scaleX = parseFloat(this.value);
    };
    document.getElementById("scaleY").oninput = function() {
        scaleY = parseFloat(this.value);
    };
    document.getElementById("scaleZ").oninput = function() {
        scaleZ = parseFloat(this.value);
    };
}

function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r / 255, g / 255, b / 255, 1.0]; // Return normalized RGB
}

function initShaders(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    return shaderProgram;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aPosition = gl.getAttribLocation(program, "aPosition");

    // Reset matrix identitas
    mat4.identity(modelViewMatrix);

    if (isSimulationRunning) {
        // Gravitasi
        if (gravityEnabled) {
            velocityY -= gravity; // Tambahkan gravitasi ke kecepatan (turun)
        }

        // Update posisi berdasarkan kecepatan yang dipengaruhi oleh gaya (force)
        positionY += velocityX; // Force X negatif untuk naik, positif untuk turun
        positionX += velocityY; // Force Y negatif untuk kiri, positif untuk kanan

        // Batasan lantai agar objek tidak jatuh terus menerus
        if (positionY > 1.0) { // Batas atas kanvas
            positionY = 1.0;
            velocityY = 0; // Berhenti di batas atas
        }
        if (positionY < -1.0) { // Batas bawah kanvas (ground level)
            positionY = -1.0;
            velocityY = 0; // Berhenti di lantai
        }

        // Batasan kiri dan kanan kanvas
        if (positionX > 1.0) { // Batas kanan kanvas
            positionX = 1.0;
            velocityX = 0; // Berhenti di batas kanan
        }
        if (positionX < -1.0) { // Batas kiri kanvas
            positionX = -1.0;
            velocityX = 0; // Berhenti di batas kiri
        }
    }

    // Translasi objek berdasarkan posisi X dan Y
    mat4.translate(modelViewMatrix, modelViewMatrix, [positionX, positionY, -3.0]);

    mat4.scale(modelViewMatrix, modelViewMatrix, [scaleX, scaleY, scaleZ]);

    // Tambahkan rotasi pada sumbu X jika rotateX aktif
    if (rotateX) {
        thetaX += 0.01;
        mat4.rotateX(modelViewMatrix, modelViewMatrix, thetaX);
    }

    // Tambahkan rotasi pada sumbu Y jika rotateY aktif
    if (rotateY) {
        thetaY += 0.01;
        mat4.rotateY(modelViewMatrix, modelViewMatrix, thetaY);
    }

    // Tambahkan rotasi pada sumbu Z jika rotateZ aktif
    if (rotateZ) {
        thetaZ += 0.01;
        mat4.rotateZ(modelViewMatrix, modelViewMatrix, thetaZ);
    }

    // Set proyeksi perspektif
    mat4.perspective(projectionMatrix, 45, gl.canvas.width / gl.canvas.height, 0.1, 100.0);

    // Kirim matriks ke shader
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uModelViewMatrix"), false, modelViewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uProjectionMatrix"), false, projectionMatrix);

    // Tentukan warna untuk setiap shape
    const uColor = gl.getUniformLocation(program, "uColor");
    gl.uniform4fv(uColor, selectedColor); // Gunakan warna yang dipilih

    const uAmbientLightColor = gl.getUniformLocation(program, "uAmbientLightColor");

    gl.uniform3fv(uAmbientLightColor, ambientLight);

    if (currentShape === 'cube') {
        drawCube(aPosition);
    } else if (currentShape === 'sphere') {
        drawSphere(aPosition);
    } else if (currentShape === 'pyramid') {
        drawPyramid(aPosition);
    } 
    
    requestAnimationFrame(render); // Loop render
}

//saya ingin buat animasi bouncing ball

function drawCube(aPosition) {
    const vertices = new Float32Array([
        // Front face
        -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,
        -0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,

        // Back face
        -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
        -0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5, -0.5, -0.5,

        // Top face
        -0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,
        -0.5,  0.5, -0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,

        // Bottom face
        -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,
        -0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,

        // Right face
         0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,
         0.5, -0.5, -0.5,   0.5,  0.5,  0.5,   0.5, -0.5,  0.5,

        // Left face
        -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,
        -0.5, -0.5, -0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPosition);

    gl.drawArrays(gl.TRIANGLES, 0, 36); // Gambar kubus
}

function drawPyramid(aPosition) {
    const vertices = new Float32Array([
        // Base of pyramid (square)
        -0.5, 0.0, -0.5,   0.5, 0.0, -0.5,   0.5, 0.0,  0.5,
        -0.5, 0.0, -0.5,   0.5, 0.0,  0.5,  -0.5, 0.0,  0.5,
        // Sides of pyramid
        -0.5, 0.0, -0.5,   0.5, 0.0, -0.5,   0.0, 1.0,  0.0,
         0.5, 0.0, -0.5,   0.5, 0.0,  0.5,   0.0, 1.0,  0.0,
         0.5, 0.0,  0.5,  -0.5, 0.0,  0.5,   0.0, 1.0,  0.0,
        -0.5, 0.0,  0.5,  -0.5, 0.0, -0.5,   0.0, 1.0,  0.0,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 18);
}

function drawSphere(aPosition) {
    const latitudeBands = 30;
    const longitudeBands = 30;
    const radius = 0.5;
    const vertices = [];

    for (let latNumber = 0; latNumber <= latitudeBands; ++latNumber) {
        const theta = latNumber * Math.PI / latitudeBands;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let longNumber = 0; longNumber <= longitudeBands; ++longNumber) {
            const phi = longNumber * 2 * Math.PI / longitudeBands;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            const x = cosPhi * sinTheta;
            const y = cosTheta;
            const z = sinPhi * sinTheta;

            vertices.push(radius * x, radius * y, radius * z);
        }
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertices.length / 3);
}

// Initialize WebGL
initWebGL();
