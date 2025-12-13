<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>Görev 1: Tek Sayılar</title>
    <style>
        body { font-family: sans-serif; padding: 20px; }
        .sayi { 
            display: inline-block; 
            padding: 5px 10px; 
            margin: 3px; 
            background-color: #f0f0f0; 
            border-radius: 5px; 
        }
    </style>
</head>
<body>
    <h2>1-100 Arası Tek Sayılar</h2>
    
    <?php
    // 1'den 100'e kadar dönen döngü
    for ($i = 1; $i <= 100; $i++) {
        // Eğer sayının 2'ye bölümünden kalan 0 DEĞİLSE (!=), o sayı tektir.
        if ($i % 2 != 0) {
            echo "<span class='sayi'>$i</span>";
        }
    }
    ?>
</body>
</html>