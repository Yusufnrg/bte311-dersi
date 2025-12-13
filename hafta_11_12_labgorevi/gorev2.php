<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>Görev 2: Dinamik Tablo</title>
    <style>
        body { font-family: sans-serif; padding: 20px; }
        table { border-collapse: collapse; margin-top: 20px; }
        td { 
            border: 1px solid #333; 
            padding: 10px; 
            text-align: center; 
            width: 40px; 
            height: 40px;
        }
        form { background: #eee; padding: 15px; border-radius: 8px; width: fit-content;}
        input { padding: 5px; width: 60px;}
        button { padding: 5px 15px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px;}
    </style>
</head>
<body>

    <form method="POST">
        <h3>Tablo Oluşturucu</h3>
        <label>Satır Sayısı:</label>
        <input type="number" name="satir" required min="1">
        
        <label>Sütun Sayısı:</label>
        <input type="number" name="sutun" required min="1">
        
        <button type="submit">Tabloyu Çiz</button>
    </form>

    <hr>

    <?php
    // Form gönderilmiş mi diye kontrol ediyoruz
    if (isset($_POST['satir']) && isset($_POST['sutun'])) {
        
        $satirSayisi = $_POST['satir'];
        $sutunSayisi = $_POST['sutun'];

        echo "<h3>$satirSayisi Satır x $sutunSayisi Sütunluk Tablo</h3>";
        echo "<table>";

        // Dış döngü: Satırları oluşturur (tr)
        for ($i = 0; $i < $satirSayisi; $i++) {
            echo "<tr>";
            
            // İç döngü: Sütunları oluşturur (td)
            for ($j = 0; $j < $sutunSayisi; $j++) {
                // 1 ile 100 arası rastgele sayı üret
                $rastgeleSayi = rand(1, 100); 
                echo "<td>$rastgeleSayi</td>";
            }
            
            echo "</tr>";
        }

        echo "</table>";
    }
    ?>

</body>
</html>